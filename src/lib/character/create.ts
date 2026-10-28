// Orquesta la creación de un personaje en el navegador: pide a la IA (vía /api/character) la imagen de
// referencia y las tiras de poses, recorta cada pose con SAM y arma las tiras de cuadros del juego.
import { CharacterError, STRIPS, type Movement, type StripKind, type StyleId } from './spec';
import { characterApi } from '$lib/ai/characterClient';
import {
	buildStrip,
	compositeOnColor,
	chromaObjects,
	cutCell,
	flipHorizontal,
	gridCells,
	cutObject,
	estimateBackground,
	newRaster,
	trimToContent,
	type Raster,
	type Strip
} from './process';
import { parseSamText, type SamObject } from './sam';

/** Ancho al que se achican las imágenes antes de mandarlas a SAM (rápido y con detalle de sobra). */
const SAM_WIDTH = 1600;
/** Verde de las referencias (el mismo que se le pide a Muse Image de fondo). */
const GREEN: [number, number, number] = [0, 177, 64];

// ---------- imágenes <-> píxeles ----------

export async function blobToRaster(blob: Blob, maxWidth = SAM_WIDTH): Promise<Raster> {
	const bitmap = await createImageBitmap(blob);
	const k = Math.min(1, maxWidth / bitmap.width);
	const w = Math.round(bitmap.width * k);
	const h = Math.round(bitmap.height * k);
	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const g = canvas.getContext('2d', { willReadFrequently: true })!;
	g.drawImage(bitmap, 0, 0, w, h);
	bitmap.close();
	const data = g.getImageData(0, 0, w, h);
	return { data: data.data, width: w, height: h };
}

export async function dataUrlToRaster(url: string, maxWidth = SAM_WIDTH): Promise<Raster> {
	return blobToRaster(await (await fetch(url)).blob(), maxWidth);
}

function canvasOf(r: Raster): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = r.width;
	canvas.height = r.height;
	canvas
		.getContext('2d')!
		.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.width, r.height), 0, 0);
	return canvas;
}

export function rasterToJpegUrl(r: Raster, quality = 0.9): string {
	return canvasOf(r).toDataURL('image/jpeg', quality);
}

export function rasterToPngUrl(r: Raster): string {
	return canvasOf(r).toDataURL('image/png');
}

export function rasterToCanvas(r: Raster): HTMLCanvasElement {
	return canvasOf(r);
}

export function rasterToPngBlob(r: Raster): Promise<Blob> {
	return new Promise((resolve, reject) =>
		canvasOf(r).toBlob((b) => (b ? resolve(b) : reject(new Error('PNG failed'))), 'image/png')
	);
}

// ---------- SAM ----------

/**
 * Variantes del sustantivo para SAM, de la más específica a la más simple: "cat with blue cap" ->
 * "cat". SAM es estricto con las frases y a veces no encuentra la larga.
 */
export function nounVariants(noun: string): string[] {
	const clean = noun.trim().toLowerCase();
	const head = clean.split(/\s+(?:with|wearing|in|holding|and)\s+/)[0].trim();
	const last = head.split(/\s+/).pop() ?? head;
	return [...new Set([clean, head, last])].filter(Boolean);
}

/**
 * Objetos que SAM encuentra para `noun` en la imagen (máscaras ya decodificadas). Si no reconoce el
 * sustantivo (pasa con estilos como pixel art o criaturas raras) y la imagen tiene fondo liso, se separan
 * las figuras por color: no depende de que el modelo sepa nombrar al personaje.
 */
export async function segment(
	r: Raster,
	noun: string,
	solidBackground = false
): Promise<SamObject[]> {
	const url = rasterToJpegUrl(r);
	for (const variant of nounVariants(noun)) {
		const objects = parseSamText(await characterApi.segment(url, variant));
		if (objects.length) return objects;
	}
	if (solidBackground) return chromaObjects(r, estimateBackground(r));
	return [];
}

/**
 * Recorta de una imagen el objeto que describe `noun` (el más grande si hay varios) y lo deja sobre
 * verde liso, listo para usarlo como referencia. Devuelve también el recorte con transparencia.
 */
export async function cutSubject(
	photo: Raster,
	noun: string,
	/** La imagen tiene fondo liso (la generó Muse Image sobre verde): se rescatan los accesorios que SAM deja afuera. */
	solidBackground = false
): Promise<{ cutout: Raster; reference: string }> {
	const objects = await segment(photo, noun, solidBackground);
	if (!objects.length)
		throw new CharacterError('notFound', `Could not find "${noun}" in the image.`);
	const area = (o: SamObject) => o.mask.data.reduce((a, b) => a + b, 0);
	const best = objects.reduce((a, b) => (area(b) > area(a) ? b : a));
	const cutout = trimToContent(
		cutObject(photo, best, solidBackground ? estimateBackground(photo) : undefined),
		6
	);
	const square = greenSquareBase(cutout);
	let reference = compositeOnColor(square, GREEN);
	let result = cutout;
	// Todas las poses salen del modelo siguiendo esta referencia: si mira a la izquierda, se espeja.
	if ((await facingOf(reference)) === 'left') {
		reference = flipHorizontal(reference);
		result = flipHorizontal(cutout);
	}
	return { cutout: result, reference: rasterToJpegUrl(reference, 0.92) };
}

/** Cuadrado con el sujeto centrado y margen, así la imagen de referencia no deforma nada. */
function greenSquareBase(cutout: Raster): Raster {
	const side = Math.max(cutout.width, cutout.height) + 24;
	const square = newRaster(side, side);
	const ox = Math.round((side - cutout.width) / 2);
	const oy = Math.round((side - cutout.height) / 2);
	for (let y = 0; y < cutout.height; y++)
		square.data.set(
			cutout.data.subarray(y * cutout.width * 4, (y + 1) * cutout.width * 4),
			((oy + y) * side + ox) * 4
		);
	return square;
}

/**
 * Reconstruye la imagen de referencia (personaje sobre verde) a partir del primer cuadro de la hoja de
 * "parado" de un personaje guardado: sirve para retocar uno creado antes de guardar su origen o importado.
 */
export async function referenceFromStand(sheet: {
	blob: Blob;
	frameWidth: number;
	frameHeight: number;
}): Promise<string> {
	const full = await blobToRaster(sheet.blob, 100000);
	const frame = newRaster(sheet.frameWidth, sheet.frameHeight);
	for (let y = 0; y < sheet.frameHeight; y++)
		frame.data.set(
			full.data.subarray(y * full.width * 4, y * full.width * 4 + sheet.frameWidth * 4),
			y * sheet.frameWidth * 4
		);
	const square = greenSquareBase(trimToContent(frame, 6));
	return rasterToJpegUrl(compositeOnColor(square, GREEN), 0.92);
}

// ---------- creación ----------

export interface CreateInput {
	movement: Movement;
	visual: string;
	noun: string;
	style: StyleId;
	/** Cómo vuela (solo voladores): lo decide Spark según el pedido; sin alas salvo que el personaje las tenga. */
	flight?: string;
	/** Imagen de referencia (data URL, personaje sobre verde); si falta se dibuja una con Muse Image. */
	reference?: string;
}

export type StepId = 'hero' | StripKind;
export type StepState = 'pending' | 'working' | 'done' | 'failed';
export type Progress = (step: StepId, state: StepState, message?: string) => void;

export interface CreatedStrips {
	reference: string;
	move: Strip;
	stand: Strip;
	jump?: Strip;
}

const MAX_TRIES = 2;

/** Hacia dónde mira el personaje de la imagen (Spark); si falla la consulta, "unclear" y no se espeja. */
async function facingOf(r: Raster): Promise<'left' | 'right' | 'front' | 'unclear'> {
	try {
		return await characterApi.facing(rasterToJpegUrl(r));
	} catch {
		return 'unclear';
	}
}

function opaqueArea(r: Raster): number {
	let n = 0;
	for (let i = 3; i < r.data.length; i += 4) if (r.data[i] > 128) n++;
	return n;
}

/** Una tira: imagen -> SAM -> poses -> tira. Si sale mal (pocas poses, error) se vuelve a pedir. */
async function makeStrip(kind: StripKind, input: CreateInput, reference: string): Promise<Strip> {
	let lastError: unknown;
	for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
		try {
			const image = await characterApi.strip(
				kind,
				input.visual,
				input.style,
				input.movement,
				reference,
				input.flight
			);
			const raster = await dataUrlToRaster(image);
			const background = estimateBackground(raster);
			const { cols, rows, min } = STRIPS[kind];
			// SAM marca las poses (semillas) y, en paralelo, Spark mira hacia dónde apuntan.
			const [seeds, facing] = await Promise.all([
				segment(raster, input.noun, false),
				kind === 'stand' ? Promise.resolve('unclear' as const) : facingOf(raster)
			]);
			// Cada pose se recorta dentro de su celda: lo que cruce el borde de la celda no cuenta.
			let frames = gridCells(raster, background, cols, rows)
				.map((cell) => cutCell(raster, cell, seeds, background))
				.filter((f): f is Raster => f !== null);
			// Una "pose" muy chica es una mota suelta, no un cuadro.
			const sizes = frames.map(opaqueArea);
			const biggest = Math.max(0, ...sizes);
			frames = frames.filter((_, i) => sizes[i] >= biggest * 0.25);
			if (frames.length < min)
				throw new CharacterError(
					'fewPoses',
					`Only ${frames.length} poses were found; at least ${min} are needed.`
				);
			// El juego espera personajes que miran a la derecha.
			if (facing === 'left') frames = frames.map(flipHorizontal);
			return buildStrip(frames, input.movement === 'walk' ? 'feet' : 'center');
		} catch (e) {
			lastError = e;
		}
	}
	throw lastError instanceof Error ? lastError : new Error('The strip could not be made.');
}

export async function createCharacter(
	input: CreateInput,
	onProgress: Progress
): Promise<CreatedStrips> {
	let reference = input.reference;
	if (!reference) {
		onProgress('hero', 'working');
		try {
			const hero = await dataUrlToRaster(
				await characterApi.hero(input.visual, input.style, input.movement),
				1024
			);
			reference = (await cutSubject(hero, input.noun, true)).reference;
			onProgress('hero', 'done');
		} catch (e) {
			onProgress('hero', 'failed', (e as Error).message);
			throw e;
		}
	} else onProgress('hero', 'done');

	const kinds: StripKind[] =
		input.movement === 'walk' ? ['move', 'jump', 'stand'] : ['move', 'stand'];
	kinds.forEach((k) => onProgress(k, 'working'));
	const results = await Promise.all(
		kinds.map(async (kind) => {
			try {
				const strip = await makeStrip(kind, input, reference!);
				onProgress(kind, 'done');
				return strip;
			} catch (e) {
				onProgress(kind, 'failed', (e as Error).message);
				throw e;
			}
		})
	);
	const byKind = Object.fromEntries(kinds.map((k, i) => [k, results[i]])) as Record<
		StripKind,
		Strip
	>;
	return { reference, move: byKind.move, stand: byKind.stand, jump: byKind.jump };
}

export type RefineScope = 'all' | StripKind;

export interface Creation {
	input: CreateInput;
	created: CreatedStrips;
}

/**
 * Retoca un personaje ya creado sin empezar de cero. Spark aplica el cambio a la descripción; después:
 *   'all'  -> se edita la imagen del personaje (Muse Image con la actual como referencia) y se rehacen
 *             todas las hojas con la nueva;
 *   hoja   -> se rehace solo esa hoja con la referencia de siempre y la descripción nueva.
 */
export async function refineCharacter(
	prev: Creation,
	instruction: string,
	scope: RefineScope,
	lang: 'es' | 'en',
	onProgress: Progress,
	/** Estilo nuevo (solo con alcance 'all'); si cambia, se redibuja el mismo personaje en ese estilo. */
	newStyle?: StyleId
): Promise<Creation> {
	const { input, created } = prev;
	const restyle = scope === 'all' && !!newStyle && newStyle !== input.style;
	// Solo se cambió el estilo (sin texto): la descripción queda igual y no hace falta consultar a Spark.
	const refined = instruction.trim()
		? await characterApi.refine(input.visual, input.noun, input.flight ?? '', instruction, lang)
		: {
				status: 'ok' as const,
				message: '',
				visual: input.visual,
				noun: input.noun,
				flight: input.flight ?? ''
			};
	if (refined.status !== 'ok') throw new CharacterError('refused', refined.message || instruction);
	const next: CreateInput = {
		...input,
		style: restyle ? newStyle! : input.style,
		visual: refined.visual,
		noun: refined.noun || input.noun,
		flight: input.movement === 'fly' ? refined.flight || input.flight : undefined
	};

	if (scope === 'all') {
		onProgress('hero', 'working');
		let reference: string;
		try {
			const hero = await dataUrlToRaster(
				await characterApi.hero(next.visual, next.style, next.movement, {
					reference: created.reference,
					change: instruction.trim(),
					restyle
				}),
				1024
			);
			reference = (await cutSubject(hero, next.noun, true)).reference;
			onProgress('hero', 'done');
		} catch (e) {
			onProgress('hero', 'failed', (e as Error).message);
			throw e;
		}
		return { input: next, created: await createCharacter({ ...next, reference }, onProgress) };
	}

	onProgress(scope, 'working');
	try {
		const strip = await makeStrip(scope, next, created.reference);
		onProgress(scope, 'done');
		return { input: next, created: { ...created, [scope]: strip } };
	} catch (e) {
		onProgress(scope, 'failed', (e as Error).message);
		throw e;
	}
}
