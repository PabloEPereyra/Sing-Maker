// Importar un personaje descargado (el .zip que genera "Exportar"). Se valida todo lo que viene del archivo:
// el zip puede venir de cualquier lado, así que se limitan tamaños, se verifican los CRC y se comprueba que
// cada PNG sea realmente una imagen con las medidas que dice el manifiesto.
import { crc32 } from './zip';
import { STYLES, type StyleId } from './spec';
import type { CharacterMeta, CharacterRecord, SheetRecord } from './store.svelte';

export type ImportErrorCode =
	'notZip' | 'tooBig' | 'noManifest' | 'badManifest' | 'missingFile' | 'badImage';

export class ImportError extends Error {
	constructor(
		readonly code: ImportErrorCode,
		message: string
	) {
		super(message);
	}
}

/** Límites: un personaje exportado pesa ~1 MB; esto deja margen y frena archivos enormes o zips bomba. */
export const MAX_ZIP_BYTES = 30_000_000;
const MAX_ENTRIES = 40;
const MAX_ENTRY_BYTES = 12_000_000;
const MAX_TOTAL_BYTES = 40_000_000;
const MAX_FRAMES = 16;
const MAX_FRAME_PX = 1000;

// ---------- zip ----------

async function inflateRaw(data: Uint8Array, expected: number): Promise<Uint8Array> {
	const stream = new Blob([data as BlobPart])
		.stream()
		.pipeThrough(new DecompressionStream('deflate-raw'));
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.length;
		// Se corta apenas pasa de lo declarado: una entrada que "crece" es un zip bomba.
		if (total > expected || total > MAX_ENTRY_BYTES) {
			await reader.cancel();
			throw new ImportError('tooBig', 'A file inside the zip is bigger than declared.');
		}
		chunks.push(value);
	}
	const out = new Uint8Array(total);
	let at = 0;
	for (const c of chunks) {
		out.set(c, at);
		at += c.length;
	}
	return out;
}

/** Lee un zip (sin compresión o deflate) y devuelve sus archivos por nombre base. */
export async function readZip(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
	if (bytes.length < 22 || bytes.length > MAX_ZIP_BYTES)
		throw new ImportError(bytes.length < 22 ? 'notZip' : 'tooBig', 'Not a valid zip.');
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let eocd = -1;
	for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--)
		if (view.getUint32(i, true) === 0x06054b50) {
			eocd = i;
			break;
		}
	if (eocd < 0) throw new ImportError('notZip', 'Not a valid zip.');
	const count = view.getUint16(eocd + 10, true);
	if (count > MAX_ENTRIES) throw new ImportError('tooBig', 'Too many files in the zip.');
	let cd = view.getUint32(eocd + 16, true);
	const decoder = new TextDecoder();
	const files = new Map<string, Uint8Array>();
	let total = 0;
	for (let n = 0; n < count; n++) {
		if (cd + 46 > bytes.length || view.getUint32(cd, true) !== 0x02014b50)
			throw new ImportError('notZip', 'Damaged zip.');
		const method = view.getUint16(cd + 10, true);
		const crc = view.getUint32(cd + 16, true);
		const csize = view.getUint32(cd + 20, true);
		const usize = view.getUint32(cd + 24, true);
		const nameLen = view.getUint16(cd + 28, true);
		const extraLen = view.getUint16(cd + 30, true);
		const commentLen = view.getUint16(cd + 32, true);
		const offset = view.getUint32(cd + 42, true);
		const name = decoder.decode(bytes.subarray(cd + 46, cd + 46 + nameLen));
		cd += 46 + nameLen + extraLen + commentLen;
		if (name.endsWith('/')) continue;
		if (usize > MAX_ENTRY_BYTES || (total += usize) > MAX_TOTAL_BYTES)
			throw new ImportError('tooBig', 'The zip is too big.');
		if (offset + 30 > bytes.length || view.getUint32(offset, true) !== 0x04034b50)
			throw new ImportError('notZip', 'Damaged zip.');
		const start =
			offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
		const raw = bytes.subarray(start, start + csize);
		if (raw.length !== csize) throw new ImportError('notZip', 'Damaged zip.');
		let data: Uint8Array;
		if (method === 0) data = raw;
		else if (method === 8) data = await inflateRaw(raw, usize);
		else throw new ImportError('notZip', 'Unsupported compression.');
		if (data.length !== usize || crc32(data) !== crc)
			throw new ImportError('notZip', 'A file in the zip is damaged.');
		// Solo importa el nombre del archivo: las rutas internas se ignoran.
		files.set(name.split(/[\\/]/).pop() ?? name, data);
	}
	return files;
}

// ---------- manifiesto ----------

export interface SheetInfo {
	file: string;
	frames: number;
	frameWidth: number;
	frameHeight: number;
}

export interface Manifest {
	name: string;
	movement: 'walk' | 'fly';
	stand: SheetInfo;
	move: SheetInfo;
	jump?: SheetInfo;
	source?: { visual: string; noun: string; flight?: string; style: StyleId; reference?: string };
}

function sheetInfo(raw: unknown, role: string): SheetInfo {
	const s = raw as Partial<SheetInfo> | null;
	const int = (v: unknown, max: number) =>
		typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= max;
	if (
		!s ||
		typeof s.file !== 'string' ||
		!s.file.toLowerCase().endsWith('.png') ||
		!int(s.frames, MAX_FRAMES) ||
		!int(s.frameWidth, MAX_FRAME_PX) ||
		!int(s.frameHeight, MAX_FRAME_PX)
	)
		throw new ImportError('badManifest', `Invalid sheet "${role}".`);
	return {
		file: s.file.split(/[\\/]/).pop()!,
		frames: s.frames as number,
		frameWidth: s.frameWidth as number,
		frameHeight: s.frameHeight as number
	};
}

/** Valida el `character.json` y lo deja con la forma que usa el juego. */
export function parseManifest(json: unknown): Manifest {
	const m = json as {
		name?: unknown;
		movement?: unknown;
		sheets?: Record<string, unknown>;
		source?: unknown;
	} | null;
	if (!m || typeof m !== 'object' || !m.sheets || typeof m.sheets !== 'object')
		throw new ImportError('badManifest', 'The character file is not valid.');
	if (m.movement !== 'walk' && m.movement !== 'fly')
		throw new ImportError('badManifest', 'Unknown movement type.');
	const name = typeof m.name === 'string' ? m.name.trim().slice(0, 30) : '';
	const out: Manifest = {
		name: name || 'Personaje',
		movement: m.movement,
		stand: sheetInfo(m.sheets.stand, 'stand'),
		move: sheetInfo(m.sheets.move, 'move')
	};
	if (m.sheets.jump) out.jump = sheetInfo(m.sheets.jump, 'jump');
	// El origen es opcional: si algo no cuadra se ignora (se reconstruye al editar).
	const src = m.source as Record<string, unknown> | undefined;
	if (
		src &&
		typeof src.visual === 'string' &&
		src.visual.length <= 600 &&
		typeof src.noun === 'string' &&
		src.noun.length <= 80 &&
		(STYLES as readonly string[]).includes(src.style as string)
	)
		out.source = {
			visual: src.visual,
			noun: src.noun,
			flight: typeof src.flight === 'string' ? src.flight.slice(0, 300) : undefined,
			style: src.style as StyleId,
			reference: typeof src.reference === 'string' ? src.reference.split(/[\\/]/).pop() : undefined
		};
	// Un caminante sin salto se arregla en el juego (usa el cuadro de carrera); un volador no lo necesita.
	return out;
}

// ---------- archivo completo ----------

/** Comprueba que los bytes sean un PNG con las medidas del manifiesto y arma la hoja. */
export async function toSheet(
	files: Map<string, Uint8Array>,
	info: SheetInfo
): Promise<SheetRecord> {
	const data = files.get(info.file);
	if (!data) throw new ImportError('missingFile', `Missing file ${info.file}.`);
	const isPng = data.length > 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e;
	if (!isPng) throw new ImportError('badImage', `${info.file} is not a PNG.`);
	const blob = new Blob([data as BlobPart], { type: 'image/png' });
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(blob);
	} catch {
		throw new ImportError('badImage', `${info.file} could not be read.`);
	}
	const ok = bitmap.width === info.frames * info.frameWidth && bitmap.height === info.frameHeight;
	bitmap.close();
	if (!ok) throw new ImportError('badImage', `${info.file} does not match its frame size.`);
	return { blob, frames: info.frames, frameWidth: info.frameWidth, frameHeight: info.frameHeight };
}

export type ImportedCharacter = Omit<CharacterRecord, 'id' | 'createdAt'>;

/** Lee el .zip de un personaje exportado y devuelve lo necesario para guardarlo. */
export async function importCharacter(file: Blob): Promise<ImportedCharacter> {
	if (file.size > MAX_ZIP_BYTES) throw new ImportError('tooBig', 'The file is too big.');
	const files = await readZip(new Uint8Array(await file.arrayBuffer()));
	const raw = files.get('character.json');
	if (!raw) throw new ImportError('noManifest', 'The zip has no character.json.');
	let json: unknown;
	try {
		json = JSON.parse(new TextDecoder().decode(raw));
	} catch {
		throw new ImportError('badManifest', 'character.json is not valid JSON.');
	}
	const manifest = parseManifest(json);
	let meta: CharacterMeta | undefined;
	const refBytes = manifest.source?.reference && files.get(manifest.source.reference);
	if (manifest.source && refBytes && refBytes[0] === 0xff && refBytes[1] === 0xd8) {
		let bin = '';
		for (let i = 0; i < refBytes.length; i += 0x8000)
			bin += String.fromCharCode(...refBytes.subarray(i, i + 0x8000));
		meta = {
			visual: manifest.source.visual,
			noun: manifest.source.noun,
			flight: manifest.source.flight,
			style: manifest.source.style,
			reference: `data:image/jpeg;base64,${btoa(bin)}`
		};
	}
	return {
		meta,
		name: manifest.name,
		movement: manifest.movement,
		stand: await toSheet(files, manifest.stand),
		move: await toSheet(files, manifest.move),
		jump: manifest.jump ? await toSheet(files, manifest.jump) : undefined
	};
}
