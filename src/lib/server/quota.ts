// Cupos por persona para los endpoints con IA. Cada tipo de llamada tiene un tope que se cuenta en una
// base D1 (binding DB) con un UPSERT atómico, así que dos pedidos a la vez no pueden pasarse del límite.
// Quién es la persona se decide de dos maneras:
// - Con ACCESS_CODES («nombre=código» separados por comas): por el código del encabezado X-Access-Code.
// - Sin códigos (lo normal por ahora): por un identificador anónimo que cada navegador genera y manda en
//   X-Client-Id. Se esquiva borrando los datos del sitio, pero alcanza para acotar el gasto.
// Sin códigos y sin base D1 el acceso es libre y no se cuenta nada (desarrollo local).

/**
 * Qué se cuenta: los ejercicios y patrones de batería, los personajes (la imagen principal), el resto de las
 * imágenes (tiras de animación y fondos) y las demás llamadas.
 */
export type Bucket = 'exercises' | 'characters' | 'images' | 'other';

export const BUCKETS: Bucket[] = ['exercises', 'characters', 'images', 'other'];

/** Lo mínimo que se usa de la API de D1. */
export interface D1Like {
	prepare(sql: string): {
		bind(...values: unknown[]): {
			run(): Promise<{ meta: { changes: number } }>;
			all<T>(): Promise<{ results: T[] }>;
		};
		run(): Promise<unknown>;
	};
}

/** Las variables y el binding que usa este módulo. */
export interface QuotaEnv {
	ACCESS_CODES?: string;
	LIMIT_EXERCISES?: string;
	LIMIT_CHARACTERS?: string;
	LIMIT_IMAGES?: string;
	LIMIT_OTHER?: string;
	DB?: D1Like;
}

/** El entorno completo de una función de Pages: variables de texto más el binding de la base. */
export type FunctionEnv = Record<string, string | undefined> & QuotaEnv;

export const DEFAULT_LIMITS: Record<Bucket, number> = {
	exercises: 200,
	characters: 40,
	// Tiras y fondos: unas 4 por personaje, más los reintentos (también los que pide la revisión de Wonder).
	images: 300,
	other: 3000
};

export const limitsFromEnv = (env: QuotaEnv): Record<Bucket, number> => {
	const raw: Record<Bucket, string | undefined> = {
		exercises: env.LIMIT_EXERCISES,
		characters: env.LIMIT_CHARACTERS,
		images: env.LIMIT_IMAGES,
		other: env.LIMIT_OTHER
	};
	const out = { ...DEFAULT_LIMITS };
	for (const b of BUCKETS) {
		const n = Number(raw[b]);
		if (raw[b] !== undefined && raw[b] !== '' && Number.isFinite(n) && n >= 0)
			out[b] = Math.floor(n);
	}
	return out;
};

/** «ana=K3f9,beto=Pq82»: código → nombre. Sin «=», el código también es el nombre. */
export function parseCodes(raw: string | undefined): Map<string, string> {
	const codes = new Map<string, string>();
	for (const part of (raw ?? '').split(/[,;\n]/)) {
		const item = part.trim();
		if (!item) continue;
		const i = item.indexOf('=');
		const name = i < 0 ? item : item.slice(0, i).trim();
		const code = i < 0 ? item : item.slice(i + 1).trim();
		if (name && code) codes.set(code, name);
	}
	return codes;
}

export const ACCESS_HEADER = 'X-Access-Code';
export const CLIENT_HEADER = 'X-Client-Id';

export type Gate =
	{ ok: true; user: string | null } | { ok: false; status: number; error: string; bucket?: Bucket };

/** Identificador anónimo válido: solo letras, números, guiones y guiones bajos. */
const CLIENT_ID = /^[A-Za-z0-9_-]{16,64}$/;

/**
 * Quién es. `open` = no hay nada que contar (sin códigos ni base). `mode` dice cómo se reconoció a la persona:
 * por código o por dispositivo; `user` es `null` si falta el dato o no es válido.
 */
export function identify(
	request: Request,
	env: QuotaEnv
): { open: true } | { open: false; mode: 'code' | 'device'; user: string | null; sent: boolean } {
	const codes = parseCodes(env.ACCESS_CODES);
	if (codes.size > 0) {
		const code = request.headers.get(ACCESS_HEADER)?.trim() ?? '';
		return { open: false, mode: 'code', user: codes.get(code) ?? null, sent: !!code };
	}
	if (!env.DB) return { open: true };
	const id = request.headers.get(CLIENT_HEADER)?.trim() ?? '';
	return {
		open: false,
		mode: 'device',
		user: CLIENT_ID.test(id) ? `device:${id}` : null,
		sent: !!id
	};
}

/** Error para quien no se pudo reconocer. */
function unknownUser(who: {
	mode: 'code' | 'device';
	sent: boolean;
}): Extract<Gate, { ok: false }> {
	if (who.mode === 'device') return { ok: false, status: 400, error: 'client_id_required' };
	return {
		ok: false,
		status: 401,
		error: who.sent ? 'invalid_access_code' : 'access_code_required'
	};
}

let ready: Promise<unknown> | null = null;

/** Crea la tabla la primera vez que se usa (por instancia). */
function ensureTable(db: D1Like): Promise<unknown> {
	ready ??= db
		.prepare(
			'CREATE TABLE IF NOT EXISTS usage (name TEXT NOT NULL, bucket TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (name, bucket))'
		)
		.run()
		.catch((e) => {
			ready = null;
			throw e;
		});
	return ready;
}

/** Revisa el código y suma una llamada al cupo; `ok: false` trae el estado y el mensaje para responder. */
export async function charge(request: Request, env: QuotaEnv, bucket: Bucket): Promise<Gate> {
	const who = identify(request, env);
	if (who.open) return { ok: true, user: null };
	if (who.user === null) return unknownUser(who);
	const db = env.DB;
	if (!db) return { ok: false, status: 500, error: 'quota_unavailable' };
	const limit = limitsFromEnv(env)[bucket];
	if (limit <= 0) return { ok: false, status: 429, error: 'quota_exceeded', bucket };
	try {
		await ensureTable(db);
		const r = await db
			.prepare(
				'INSERT INTO usage (name, bucket, n) VALUES (?1, ?2, 1) ON CONFLICT(name, bucket) DO UPDATE SET n = n + 1 WHERE n < ?3'
			)
			.bind(who.user, bucket, limit)
			.run();
		if (r.meta.changes < 1) return { ok: false, status: 429, error: 'quota_exceeded', bucket };
	} catch {
		return { ok: false, status: 500, error: 'quota_unavailable' };
	}
	return { ok: true, user: who.user };
}

/** Devuelve una llamada al cupo cuando el servidor falló por su cuenta (no se gastó crédito). */
export async function refund(env: QuotaEnv, user: string | null, bucket: Bucket): Promise<void> {
	if (!user || !env.DB) return;
	try {
		await env.DB.prepare('UPDATE usage SET n = MAX(n - 1, 0) WHERE name = ?1 AND bucket = ?2')
			.bind(user, bucket)
			.run();
	} catch {
		// sin devolución: el cupo queda como estaba
	}
}

export interface UsageReport {
	/** Sin códigos ni base de datos: no hay cupos. */
	open: boolean;
	/** `true` si las personas se reconocen por código (y se muestra el campo para escribirlo). */
	codes?: boolean;
	name?: string;
	used?: Record<Bucket, number>;
	limits?: Record<Bucket, number>;
}

/** Consumo de quien hace el pedido (para mostrarlo en el perfil). */
export async function usageFor(
	request: Request,
	env: QuotaEnv
): Promise<Extract<Gate, { ok: false }> | UsageReport> {
	const who = identify(request, env);
	if (who.open) return { open: true };
	if (who.user === null) return unknownUser(who);
	const used: Record<Bucket, number> = { exercises: 0, characters: 0, images: 0, other: 0 };
	if (env.DB) {
		try {
			await ensureTable(env.DB);
			const rows = await env.DB.prepare('SELECT bucket, n FROM usage WHERE name = ?1')
				.bind(who.user)
				.all<{ bucket: Bucket; n: number }>();
			for (const row of rows.results) if (row.bucket in used) used[row.bucket] = row.n;
		} catch {
			return { ok: false, status: 500, error: 'quota_unavailable' };
		}
	}
	return {
		open: false,
		codes: who.mode === 'code',
		name: who.user,
		used,
		limits: limitsFromEnv(env)
	};
}
