// Base D1 (binding DB): la interfaz mínima que usa el servidor y el esquema, que se crea solo en el primer uso.
// Tablas:
//   usage          cupo gratis gastado por persona (dispositivo, cuenta o código) y tipo de llamada
//   users          cuentas (por email) con su saldo de créditos
//   sessions       sesiones abiertas (se guarda el hash del token de la cookie, nunca el token)
//   login_tokens   enlaces de inicio de sesión mandados por email (hash, vencen y se usan una sola vez)
//   credit_ledger  cada movimiento de créditos: compras, usos y devoluciones (`ref` único evita duplicados)
//   age_confirmations  cuándo cada persona (dispositivo, cuenta o código) declaró tener 18 años o más
//   payment_reversals  por compra, cuántos créditos hay que quitar por reembolsos o disputas y cuántos se quitaron
//   welcome_grants cuándo se dio el regalo de bienvenida y desde qué red (hash de la IP), para el tope por IP

/** Resultado de una consulta ya con sus parámetros. */
export interface D1Bound {
	run(): Promise<{ meta: { changes: number } }>;
	all<T>(): Promise<{ results: T[] }>;
	first<T>(): Promise<T | null>;
}

/** Lo mínimo que se usa de la API de D1. */
export interface D1Like {
	prepare(sql: string): {
		bind(...values: unknown[]): D1Bound;
		run(): Promise<unknown>;
	};
	/** Varias consultas en una transacción (todas o ninguna). */
	batch?(statements: D1Bound[]): Promise<unknown[]>;
}

const SCHEMA = [
	'CREATE TABLE IF NOT EXISTS usage (name TEXT NOT NULL, bucket TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (name, bucket))',
	'CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, credits INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)',
	'CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL)',
	'CREATE TABLE IF NOT EXISTS login_tokens (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0)',
	'CREATE INDEX IF NOT EXISTS login_tokens_email ON login_tokens (email, created_at)',
	'CREATE TABLE IF NOT EXISTS credit_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, delta INTEGER NOT NULL, reason TEXT NOT NULL, ref TEXT UNIQUE, created_at INTEGER NOT NULL)',
	'CREATE INDEX IF NOT EXISTS credit_ledger_user ON credit_ledger (user_id, created_at)',
	'CREATE TABLE IF NOT EXISTS age_confirmations (name TEXT PRIMARY KEY, confirmed_at INTEGER NOT NULL)',
	'CREATE TABLE IF NOT EXISTS payment_reversals (payment_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, due INTEGER NOT NULL DEFAULT 0, taken INTEGER NOT NULL DEFAULT 0, op TEXT NOT NULL)',
	'CREATE TABLE IF NOT EXISTS welcome_grants (ip_hash TEXT NOT NULL, created_at INTEGER NOT NULL)',
	'CREATE INDEX IF NOT EXISTS welcome_grants_ip ON welcome_grants (ip_hash, created_at)'
];

const ready = new WeakMap<D1Like, Promise<unknown>>();

/** Crea las tablas la primera vez que se usa cada base (por instancia). */
export function ensureSchema(db: D1Like): Promise<unknown> {
	let p = ready.get(db);
	if (!p) {
		p = (async () => {
			for (const sql of SCHEMA) await db.prepare(sql).run();
		})().catch((e) => {
			ready.delete(db);
			throw e;
		});
		ready.set(db, p);
	}
	return p;
}

/** Corre las consultas juntas: en transacción si la base lo permite (D1 sí), si no una tras otra. */
export async function inBatch(db: D1Like, statements: D1Bound[]): Promise<void> {
	if (db.batch) await db.batch(statements);
	else for (const s of statements) await s.run();
}
