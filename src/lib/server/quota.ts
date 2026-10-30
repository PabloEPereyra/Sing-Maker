// Acceso por código y cupos por persona para los endpoints con IA. Cada persona recibe un código
// (variable ACCESS_CODES, «nombre=código» separados por comas) y cada tipo de llamada tiene un tope
// que se cuenta en una base D1 (binding DB) con un UPSERT atómico, así que dos pedidos a la vez no
// pueden pasarse del límite. Sin ACCESS_CODES el acceso es libre y no se cuenta nada (desarrollo).

/** Qué se cuenta: los ejercicios y patrones de batería, las imágenes (personajes, fondos, objetos) y el resto. */
export type Bucket = 'exercises' | 'images' | 'other';

export const BUCKETS: Bucket[] = ['exercises', 'images', 'other'];

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
	LIMIT_IMAGES?: string;
	LIMIT_OTHER?: string;
	DB?: D1Like;
}

/** El entorno completo de una función de Pages: variables de texto más el binding de la base. */
export type FunctionEnv = Record<string, string | undefined> & QuotaEnv;

export const DEFAULT_LIMITS: Record<Bucket, number> = {
	exercises: 500,
	// 50 personajes: cada uno usa 3 o 4 imágenes y algunas se repiten.
	images: 250,
	other: 3000
};

export const limitsFromEnv = (env: QuotaEnv): Record<Bucket, number> => {
	const raw: Record<Bucket, string | undefined> = {
		exercises: env.LIMIT_EXERCISES,
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

export type Gate =
	{ ok: true; user: string | null } | { ok: false; status: number; error: string; bucket?: Bucket };

/** Quién es (por el código del encabezado). `open` = no hay códigos configurados. */
export function identify(
	request: Request,
	env: QuotaEnv
): { open: true } | { open: false; user: string | null } {
	const codes = parseCodes(env.ACCESS_CODES);
	if (codes.size === 0) return { open: true };
	const code = request.headers.get(ACCESS_HEADER)?.trim() ?? '';
	return { open: false, user: codes.get(code) ?? null };
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
	if (who.user === null) {
		const sent = !!request.headers.get(ACCESS_HEADER)?.trim();
		return {
			ok: false,
			status: 401,
			error: sent ? 'invalid_access_code' : 'access_code_required'
		};
	}
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
	/** Sin códigos configurados: no hay cupos. */
	open: boolean;
	name?: string;
	used?: Record<Bucket, number>;
	limits?: Record<Bucket, number>;
}

/** Consumo de quien manda el código (para mostrarlo en el perfil). */
export async function usageFor(
	request: Request,
	env: QuotaEnv
): Promise<Extract<Gate, { ok: false }> | UsageReport> {
	const who = identify(request, env);
	if (who.open) return { open: true };
	if (who.user === null) {
		const sent = !!request.headers.get(ACCESS_HEADER)?.trim();
		return { ok: false, status: 401, error: sent ? 'invalid_access_code' : 'access_code_required' };
	}
	const used: Record<Bucket, number> = { exercises: 0, images: 0, other: 0 };
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
	return { open: false, name: who.user, used, limits: limitsFromEnv(env) };
}
