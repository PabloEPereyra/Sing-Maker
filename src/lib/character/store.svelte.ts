// Personajes creados con IA, guardados en el dispositivo (IndexedDB: son imágenes, no caben en
// localStorage). Cada personaje guarda sus tiras de cuadros como PNG con transparencia.
import { idbRun } from './idb';
import type { Movement, StyleId } from './spec';

/** Tope de personajes propios (cada uno pesa ~1–2 MB). */
export const MAX_CHARACTERS = 12;

export interface SheetRecord {
	blob: Blob;
	frames: number;
	frameWidth: number;
	frameHeight: number;
}

/** Con qué se creó el personaje: es lo que permite retocarlo después. */
export interface CharacterMeta {
	visual: string;
	noun: string;
	flight?: string;
	style: StyleId;
	/** Imagen de referencia del personaje sobre verde (JPEG, data URL). */
	reference: string;
}

export interface CharacterRecord {
	id: string;
	name: string;
	movement: Movement;
	createdAt: number;
	/** Cuadro 0: parado de perfil; cuadro 1: de frente. */
	stand: SheetRecord;
	/** Ciclo de carrera (caminante) o de aleteo (volador). */
	move: SheetRecord;
	/** Solo caminantes: despegue, subida, bajada. */
	jump?: SheetRecord;
	/** Ausente en los creados antes de poder editar y en algunos importados: se reconstruye al editar. */
	meta?: CharacterMeta;
}

export const characters = $state<{ list: CharacterRecord[]; loaded: boolean }>({
	list: [],
	loaded: false
});

const run = <T>(mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>) =>
	idbRun('characters', mode, work);

export async function loadCharacters(): Promise<void> {
	try {
		const all = await run<CharacterRecord[]>('readonly', (s) => s.getAll());
		characters.list = all.sort((a, b) => a.createdAt - b.createdAt);
	} catch {
		characters.list = []; // sin IndexedDB (modo privado, etc.): simplemente no hay personajes propios
	}
	characters.loaded = true;
}

export async function addCharacter(
	rec: Omit<CharacterRecord, 'id' | 'createdAt'>
): Promise<CharacterRecord> {
	const full: CharacterRecord = {
		...rec,
		id: `c${Date.now().toString(36)}`,
		createdAt: Date.now()
	};
	// Los registros que vienen de la lista reactiva son proxies: IndexedDB solo guarda copias limpias.
	const plain = $state.snapshot(full) as CharacterRecord;
	await run('readwrite', (s) => s.put(plain));
	characters.list = [...characters.list, plain];
	return plain;
}

/** Reemplaza un personaje guardado (editado). */
export async function updateCharacter(rec: CharacterRecord): Promise<void> {
	const plain = $state.snapshot(rec) as CharacterRecord;
	await run('readwrite', (s) => s.put(plain));
	characters.list = characters.list.map((c) => (c.id === plain.id ? plain : c));
}

export async function removeCharacter(id: string): Promise<void> {
	await run('readwrite', (s) => s.delete(id));
	characters.list = characters.list.filter((c) => c.id !== id);
}

export const findCharacter = (id: string): CharacterRecord | undefined =>
	characters.list.find((c) => c.id === id);

/** Los personajes propios se identifican en los ajustes como `custom:<id>`. */
export const CUSTOM_PREFIX = 'custom:' as const;
export const customId = (id: string): `custom:${string}` => `${CUSTOM_PREFIX}${id}`;
export const isCustomId = (id: string): boolean => id.startsWith(CUSTOM_PREFIX);
