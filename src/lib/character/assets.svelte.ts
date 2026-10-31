// Objetos para recoger y fondos creados con IA, guardados en el dispositivo (ver idb.ts).
import { idbRun } from './idb';
import type { SheetRecord } from './store.svelte';
import type { Movement, StyleId } from './spec';

/** Topes (cada objeto pesa unos cientos de KB; cada fondo, ~0,5 MB). */
export const MAX_ITEMS = 12;
export const MAX_SCENES = 12;

/** Objeto para recoger: una hoja de 3 cuadros (normal, inclinado, brillante). */
export interface ItemRecord {
	id: string;
	name: string;
	createdAt: number;
	sheet: SheetRecord;
	style?: StyleId;
}

/** Fondo: una imagen ancha que se repite al avanzar. */
export interface SceneRecord {
	id: string;
	name: string;
	createdAt: number;
	/** Para qué tipo de personaje se hizo: los caminantes necesitan un sendero, los voladores solo cielo. */
	movement: Movement;
	image: Blob;
	/** Caminantes: altura del suelo como fracción del alto (por donde camina el personaje). */
	ground: number;
}

export const assets = $state<{ items: ItemRecord[]; scenes: SceneRecord[]; loaded: boolean }>({
	items: [],
	scenes: [],
	loaded: false
});

export async function loadAssets(): Promise<void> {
	try {
		const [items, scenes] = await Promise.all([
			idbRun<ItemRecord[]>('items', 'readonly', (s) => s.getAll()),
			idbRun<SceneRecord[]>('scenes', 'readonly', (s) => s.getAll())
		]);
		assets.items = items.sort((a, b) => a.createdAt - b.createdAt);
		assets.scenes = scenes.sort((a, b) => a.createdAt - b.createdAt);
	} catch {
		assets.items = [];
		assets.scenes = [];
	}
	assets.loaded = true;
}

const newId = (prefix: string) => `${prefix}${Date.now().toString(36)}`;

export async function addItem(rec: Omit<ItemRecord, 'id' | 'createdAt'>): Promise<ItemRecord> {
	const plain = $state.snapshot({ ...rec, id: newId('i'), createdAt: Date.now() }) as ItemRecord;
	await idbRun('items', 'readwrite', (s) => s.put(plain));
	assets.items = [...assets.items, plain];
	return plain;
}

/** Reemplaza un objeto guardado (editado). */
export async function updateItem(rec: ItemRecord): Promise<void> {
	const plain = $state.snapshot(rec) as ItemRecord;
	await idbRun('items', 'readwrite', (s) => s.put(plain));
	assets.items = assets.items.map((i) => (i.id === plain.id ? plain : i));
}

/** Copia de un objeto (una variante para retocar sin tocar el original); la hoja es una imagen que no cambia. */
export function duplicateItem(rec: ItemRecord, suffix: string): Promise<ItemRecord> {
	return addItem({
		name: `${rec.name} (${suffix})`.slice(0, 30),
		sheet: rec.sheet,
		style: rec.style
	});
}

export async function removeItem(id: string): Promise<void> {
	await idbRun('items', 'readwrite', (s) => s.delete(id));
	assets.items = assets.items.filter((i) => i.id !== id);
}

export async function addScene(rec: Omit<SceneRecord, 'id' | 'createdAt'>): Promise<SceneRecord> {
	const plain = $state.snapshot({ ...rec, id: newId('s'), createdAt: Date.now() }) as SceneRecord;
	await idbRun('scenes', 'readwrite', (s) => s.put(plain));
	assets.scenes = [...assets.scenes, plain];
	return plain;
}

/** Reemplaza un fondo guardado (editado). */
export async function updateScene(rec: SceneRecord): Promise<void> {
	const plain = $state.snapshot(rec) as SceneRecord;
	await idbRun('scenes', 'readwrite', (s) => s.put(plain));
	assets.scenes = assets.scenes.map((x) => (x.id === plain.id ? plain : x));
}

/** Copia de un fondo (una variante para retocar sin tocar el original). */
export function duplicateScene(rec: SceneRecord, suffix: string): Promise<SceneRecord> {
	return addScene({
		name: `${rec.name} (${suffix})`.slice(0, 30),
		movement: rec.movement,
		image: rec.image,
		ground: rec.ground
	});
}

export async function removeScene(id: string): Promise<void> {
	await idbRun('scenes', 'readwrite', (s) => s.delete(id));
	assets.scenes = assets.scenes.filter((x) => x.id !== id);
}

export const findItem = (id: string): ItemRecord | undefined =>
	assets.items.find((i) => i.id === id);
export const findScene = (id: string): SceneRecord | undefined =>
	assets.scenes.find((s) => s.id === id);

/** Los objetos propios se identifican en los ajustes como `custom:<id>`. */
export const ITEM_PREFIX = 'custom:' as const;
