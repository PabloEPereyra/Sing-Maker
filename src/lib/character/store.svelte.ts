// Personajes creados con IA, guardados en el dispositivo (IndexedDB: son imágenes, no caben en
// localStorage). Cada personaje guarda sus tiras de cuadros como PNG con transparencia.
import type { Movement, StyleId } from './spec';

const DB_NAME = 'singmaker';
const STORE = 'characters';
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

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

function run<T>(mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
	return open().then(
		(db) =>
			new Promise<T>((resolve, reject) => {
				const tx = db.transaction(STORE, mode);
				const req = work(tx.objectStore(STORE));
				tx.oncomplete = () => {
					db.close();
					resolve(req.result);
				};
				tx.onerror = tx.onabort = () => {
					db.close();
					reject(tx.error);
				};
			})
	);
}

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
	await run('readwrite', (s) => s.put(full));
	characters.list = [...characters.list, full];
	return full;
}

/** Reemplaza un personaje guardado (editado). */
export async function updateCharacter(rec: CharacterRecord): Promise<void> {
	await run('readwrite', (s) => s.put(rec));
	characters.list = characters.list.map((c) => (c.id === rec.id ? rec : c));
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
