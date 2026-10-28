// IndexedDB compartida por lo que se crea con IA (personajes, objetos para recoger y fondos): son imágenes,
// no caben en localStorage. Una sola base con un almacén por tipo.
const DB_NAME = 'singmaker';
const DB_VERSION = 2;
export const STORES = ['characters', 'items', 'scenes'] as const;
export type StoreName = (typeof STORES)[number];

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		// La versión 1 solo tenía "characters": al subir de versión se crean los que falten.
		req.onupgradeneeded = () => {
			for (const name of STORES)
				if (!req.result.objectStoreNames.contains(name))
					req.result.createObjectStore(name, { keyPath: 'id' });
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export function idbRun<T>(
	store: StoreName,
	mode: IDBTransactionMode,
	work: (s: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
	return open().then(
		(db) =>
			new Promise<T>((resolve, reject) => {
				const tx = db.transaction(store, mode);
				const req = work(tx.objectStore(store));
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
