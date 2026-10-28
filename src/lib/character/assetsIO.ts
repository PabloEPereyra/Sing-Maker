// Exportar e importar objetos para recoger y fondos: un .zip con la imagen y un JSON (`item.json` o
// `scene.json`). Se valida todo lo que viene del archivo igual que con los personajes (ver import.ts).
import type { ItemRecord, SceneRecord } from './assets.svelte';
import { slug } from './export';
import { ImportError, MAX_ZIP_BYTES, readZip, toSheet } from './import';
import { STYLES, type StyleId } from './spec';
import { zipStore } from './zip';

const json = (v: unknown) => new TextEncoder().encode(JSON.stringify(v, null, '\t') + '\n');

/** Medidas razonables de un fondo importado (los generados miden ~1536×864). */
const MAX_SCENE_PX = 4096;
const MIN_SCENE_PX = 64;

function sceneExtension(bytes: Uint8Array): 'png' | 'jpg' | 'webp' | null {
	if (bytes.length < 12) return null;
	if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e) return 'png';
	if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpg';
	const tag = String.fromCharCode(...bytes.subarray(0, 4), ...bytes.subarray(8, 12));
	return tag === 'RIFFWEBP' ? 'webp' : null;
}

export async function buildItemZip(
	item: Pick<ItemRecord, 'name' | 'sheet' | 'style'>
): Promise<Blob> {
	const file = `${slug(item.name, 'objeto')}.png`;
	const { frames, frameWidth, frameHeight } = item.sheet;
	return new Blob(
		[
			zipStore([
				{ name: file, data: new Uint8Array(await item.sheet.blob.arrayBuffer()) },
				{
					name: 'item.json',
					data: json({
						kind: 'item',
						name: item.name,
						style: item.style,
						sheet: { file, frames, frameWidth, frameHeight },
						note: 'Hoja de cuadros iguales en fila (PNG con transparencia): normal e inclinado.'
					})
				}
			]) as BlobPart
		],
		{ type: 'application/zip' }
	);
}

export async function buildSceneZip(
	scene: Pick<SceneRecord, 'name' | 'movement' | 'image' | 'ground'>
): Promise<Blob> {
	const bytes = new Uint8Array(await scene.image.arrayBuffer());
	const file = `${slug(scene.name, 'fondo')}.${sceneExtension(bytes) ?? 'png'}`;
	return new Blob(
		[
			zipStore([
				{ name: file, data: bytes },
				{
					name: 'scene.json',
					data: json({
						kind: 'scene',
						name: scene.name,
						movement: scene.movement,
						ground: scene.ground,
						image: file,
						note: 'Imagen ancha que se repite al avanzar. ground: altura del suelo como fracción del alto.'
					})
				}
			]) as BlobPart
		],
		{ type: 'application/zip' }
	);
}

async function readManifest(
	file: Blob,
	name: string,
	kind: string
): Promise<[Map<string, Uint8Array>, Record<string, unknown>]> {
	if (file.size > MAX_ZIP_BYTES) throw new ImportError('tooBig', 'The file is too big.');
	const files = await readZip(new Uint8Array(await file.arrayBuffer()));
	const raw = files.get(name);
	if (!raw) throw new ImportError('noManifest', `The zip has no ${name}.`);
	let data: unknown;
	try {
		data = JSON.parse(new TextDecoder().decode(raw));
	} catch {
		throw new ImportError('badManifest', `${name} is not valid JSON.`);
	}
	const m = data as Record<string, unknown> | null;
	if (!m || typeof m !== 'object' || m.kind !== kind)
		throw new ImportError('badManifest', `${name} is not valid.`);
	return [files, m];
}

const cleanName = (v: unknown, fallback: string) =>
	typeof v === 'string' && v.trim() ? v.trim().slice(0, 30) : fallback;

export type ImportedItem = Omit<ItemRecord, 'id' | 'createdAt'>;
export type ImportedScene = Omit<SceneRecord, 'id' | 'createdAt'>;

export async function importItem(file: Blob): Promise<ImportedItem> {
	const [files, m] = await readManifest(file, 'item.json', 'item');
	const s = m.sheet as Record<string, unknown> | null;
	if (!s || typeof s.file !== 'string') throw new ImportError('badManifest', 'Invalid item sheet.');
	const info = {
		file: s.file.split(/[\\/]/).pop()!,
		frames: Number(s.frames),
		frameWidth: Number(s.frameWidth),
		frameHeight: Number(s.frameHeight)
	};
	const ok = (v: number, max: number) => Number.isInteger(v) && v >= 1 && v <= max;
	if (!ok(info.frames, 16) || !ok(info.frameWidth, 1000) || !ok(info.frameHeight, 1000))
		throw new ImportError('badManifest', 'Invalid item sheet.');
	return {
		name: cleanName(m.name, 'Objeto'),
		style: (STYLES as readonly string[]).includes(m.style as string)
			? (m.style as StyleId)
			: undefined,
		sheet: await toSheet(files, info)
	};
}

export async function importScene(file: Blob): Promise<ImportedScene> {
	const [files, m] = await readManifest(file, 'scene.json', 'scene');
	if (m.movement !== 'walk' && m.movement !== 'fly')
		throw new ImportError('badManifest', 'Unknown movement type.');
	if (typeof m.image !== 'string') throw new ImportError('badManifest', 'Invalid scene image.');
	const bytes = files.get(m.image.split(/[\\/]/).pop()!);
	if (!bytes) throw new ImportError('missingFile', 'The scene image is missing.');
	const ext = sceneExtension(bytes);
	if (!ext) throw new ImportError('badImage', 'The scene image is not PNG, JPEG or WebP.');
	const image = new Blob([bytes as BlobPart], { type: `image/${ext === 'jpg' ? 'jpeg' : ext}` });
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(image);
	} catch {
		throw new ImportError('badImage', 'The scene image could not be read.');
	}
	const { width, height } = bitmap;
	bitmap.close();
	if (
		width < MIN_SCENE_PX ||
		height < MIN_SCENE_PX ||
		width > MAX_SCENE_PX ||
		height > MAX_SCENE_PX
	)
		throw new ImportError('badImage', 'The scene image has an unsupported size.');
	const ground = typeof m.ground === 'number' && Number.isFinite(m.ground) ? m.ground : 0.8;
	return {
		name: cleanName(m.name, 'Fondo'),
		movement: m.movement,
		image,
		ground: Math.max(0.5, Math.min(0.95, ground))
	};
}
