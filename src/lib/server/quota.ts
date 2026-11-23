// Cupos por persona para los endpoints con IA. Cada tipo de llamada tiene un tope que se cuenta en una
// base D1 (binding DB) con un UPSERT atómico, así que dos pedidos a la vez no pueden pasarse del límite.
// Quién es la persona se decide de dos maneras:
// - Con ACCESS_CODES («nombre=código» separados por comas): por el código del encabezado X-Access-Code.
// - Sin códigos (lo normal por ahora): por un identificador anónimo que cada navegador genera y manda en
//   X-Client-Id. Se esquiva borrando los datos del sitio, pero alcanza para acotar el gasto.
// Sin códigos y sin base D1 el acceso es libre y no se cuenta nada (desarrollo local).
//
// Cupo gratis y créditos:
// - Sin cuentas (sin inicio de sesión configurado, o con códigos de acceso) los límites LIMIT_* son el cupo de
//   cada persona y el tope.
// - Con cuentas, quien no inició sesión tiene un cupo chico por navegador (ANON_LIMIT_*: unos ejercicios, sin
//   personajes ni imágenes) y después se le pide entrar. Quien entra recibe créditos de regalo una vez
//   (src/lib/server/welcome.ts) y cada llamada descuenta créditos de su saldo según CREDIT_COST_*. Un costo 0
//   (lo normal en «other»: entrenador, dictado, revisiones) no cobra, pero solo pasa si le queda saldo.
//
// Edad: los términos de Meta Model API (sección 10.1) piden que quien usa la IA tenga 18 años o más. El navegador
// manda X-Adult: 1 cuando la persona lo declaró; la primera vez queda registrado (con la fecha) en
// age_confirmations, y sin el encabezado se acepta solo si ya había una declaración guardada para esa persona.
import { authEnabled, sessionAccount, type Account, type AuthEnv } from './auth';
import { ensureSchema, inBatch, type D1Like } from './db';
import { ANON_LIMITS, CREDIT_COSTS, FREE_LIMITS, WELCOME_CREDITS } from '../pricing';

export type { D1Like } from './db';

/**
 * Qué se cuenta: los ejercicios y patrones de batería, los personajes (la imagen principal), el resto de las
 * imágenes (tiras de animación y fondos) y las demás llamadas.
 */
export type Bucket = 'exercises' | 'characters' | 'images' | 'other';

export const BUCKETS: Bucket[] = ['exercises', 'characters', 'images', 'other'];

/** Las variables y el binding que usa este módulo. */
export interface QuotaEnv extends AuthEnv {
	ACCESS_CODES?: string;
	LIMIT_EXERCISES?: string;
	LIMIT_CHARACTERS?: string;
	LIMIT_IMAGES?: string;
	LIMIT_OTHER?: string;
	ANON_LIMIT_EXERCISES?: string;
	ANON_LIMIT_CHARACTERS?: string;
	ANON_LIMIT_IMAGES?: string;
	ANON_LIMIT_OTHER?: string;
	WELCOME_CREDITS?: string;
	CREDIT_COST_EXERCISES?: string;
	CREDIT_COST_CHARACTERS?: string;
	CREDIT_COST_IMAGES?: string;
	CREDIT_COST_OTHER?: string;
	DB?: D1Like;
}

/** El entorno completo de una función de Pages: variables de texto más el binding de la base. */
export type FunctionEnv = Record<string, string | undefined> & QuotaEnv;

/** Cupo gratis por defecto cuando no hay cuentas (ver src/lib/pricing.ts). */
export const DEFAULT_LIMITS: Record<Bucket, number> = FREE_LIMITS;

/** Cupo por defecto de quien no inició sesión cuando hay cuentas (ver src/lib/pricing.ts). */
export const DEFAULT_ANON_LIMITS: Record<Bucket, number> = ANON_LIMITS;

/** Créditos por llamada después del cupo gratis (ver src/lib/pricing.ts). */
export const DEFAULT_COSTS: Record<Bucket, number> = CREDIT_COSTS;

const numbersFromEnv = (
	raw: Record<Bucket, string | undefined>,
	defaults: Record<Bucket, number>
): Record<Bucket, number> => {
	const out = { ...defaults };
	for (const b of BUCKETS) {
		const n = Number(raw[b]);
		if (raw[b] !== undefined && raw[b] !== '' && Number.isFinite(n) && n >= 0)
			out[b] = Math.floor(n);
	}
	return out;
};

export const limitsFromEnv = (env: QuotaEnv): Record<Bucket, number> =>
	numbersFromEnv(
		{
			exercises: env.LIMIT_EXERCISES,
			characters: env.LIMIT_CHARACTERS,
			images: env.LIMIT_IMAGES,
			other: env.LIMIT_OTHER
		},
		DEFAULT_LIMITS
	);

export const anonLimitsFromEnv = (env: QuotaEnv): Record<Bucket, number> =>
	numbersFromEnv(
		{
			exercises: env.ANON_LIMIT_EXERCISES,
			characters: env.ANON_LIMIT_CHARACTERS,
			images: env.ANON_LIMIT_IMAGES,
			other: env.ANON_LIMIT_OTHER
		},
		DEFAULT_ANON_LIMITS
	);

/** Créditos de regalo al crear la cuenta (WELCOME_CREDITS, 0 = sin regalo). */
export function welcomeCredits(env: { WELCOME_CREDITS?: string }): number {
	const raw = env.WELCOME_CREDITS;
	const n = Number(raw);
	return raw !== undefined && raw !== '' && Number.isFinite(n) && n >= 0
		? Math.floor(n)
		: WELCOME_CREDITS;
}

/** El cupo gratis que le toca a quien no tiene cuenta: el chico si hay cuentas, el de siempre si no. */
const freeLimitsFor = (env: QuotaEnv, mode: 'code' | 'device' | 'account'): Record<Bucket, number> =>
	mode === 'account'
		? { exercises: 0, characters: 0, images: 0, other: 0 }
		: mode === 'device' && authEnabled(env)
			? anonLimitsFromEnv(env)
			: limitsFromEnv(env);

export const costsFromEnv = (env: QuotaEnv): Record<Bucket, number> =>
	numbersFromEnv(
		{
			exercises: env.CREDIT_COST_EXERCISES,
			characters: env.CREDIT_COST_CHARACTERS,
			images: env.CREDIT_COST_IMAGES,
			other: env.CREDIT_COST_OTHER
		},
		DEFAULT_COSTS
	);

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
export const ADULT_HEADER = 'X-Adult';

export type Gate =
	| {
			ok: true;
			/** Con qué nombre se contó el cupo (`null` si el acceso es libre). */
			user: string | null;
			/** Créditos que se descontaron (0 si salió del cupo gratis). */
			paid?: number;
			/** La cuenta que pagó, si pagó con créditos. */
			account?: string;
	  }
	| { ok: false; status: number; error: string; bucket?: Bucket };

/** Identificador anónimo válido: solo letras, números, guiones y guiones bajos. */
const CLIENT_ID = /^[A-Za-z0-9_-]{16,64}$/;

type Who =
	| { open: true }
	| {
			open: false;
			mode: 'code' | 'device' | 'account';
			user: string | null;
			sent: boolean;
			account?: Account;
	  };

/**
 * Quién es. `open` = no hay nada que contar (sin códigos ni base). `mode` dice cómo se reconoció a la persona:
 * por código, por su cuenta (sesión iniciada) o por dispositivo; `user` es `null` si falta el dato o no es válido.
 */
export async function identify(request: Request, env: QuotaEnv): Promise<Who> {
	const codes = parseCodes(env.ACCESS_CODES);
	if (codes.size > 0) {
		const code = request.headers.get(ACCESS_HEADER)?.trim() ?? '';
		return { open: false, mode: 'code', user: codes.get(code) ?? null, sent: !!code };
	}
	if (!env.DB) return { open: true };
	const account = await sessionAccount(request, env).catch(() => null);
	if (account)
		return { open: false, mode: 'account', user: `user:${account.id}`, sent: true, account };
	const id = request.headers.get(CLIENT_HEADER)?.trim() ?? '';
	return {
		open: false,
		mode: 'device',
		user: CLIENT_ID.test(id) ? `device:${id}` : null,
		sent: !!id
	};
}

/** Error para quien no se pudo reconocer. */
function unknownUser(who: { mode: string; sent: boolean }): Extract<Gate, { ok: false }> {
	if (who.mode === 'device') return { ok: false, status: 400, error: 'client_id_required' };
	return {
		ok: false,
		status: 401,
		error: who.sent ? 'invalid_access_code' : 'access_code_required'
	};
}

/**
 * ¿Declaró tener 18 años o más? Con el encabezado guarda la declaración (si no estaba); sin él, busca una
 * guardada antes para esa persona.
 */
async function confirmedAdult(request: Request, db: D1Like, user: string): Promise<boolean> {
	if (request.headers.get(ADULT_HEADER) === '1') {
		await db
			.prepare('INSERT OR IGNORE INTO age_confirmations (name, confirmed_at) VALUES (?1, ?2)')
			.bind(user, Date.now())
			.run();
		return true;
	}
	const row = await db
		.prepare('SELECT 1 AS x FROM age_confirmations WHERE name = ?1')
		.bind(user)
		.first<{ x: number }>();
	return !!row;
}

/** Suma una llamada al cupo gratis si queda; `false` si ya está lleno. */
async function takeFree(db: D1Like, user: string, bucket: Bucket, limit: number): Promise<boolean> {
	if (limit <= 0) return false;
	const r = await db
		.prepare(
			'INSERT INTO usage (name, bucket, n) VALUES (?1, ?2, 1) ON CONFLICT(name, bucket) DO UPDATE SET n = n + 1 WHERE n < ?3'
		)
		.bind(user, bucket, limit)
		.run();
	return r.meta.changes >= 1;
}

/**
 * Revisa quién es y cobra la llamada: sin sesión, del cupo gratis; con sesión, en créditos de su cuenta.
 * `ok: false` trae el estado y el mensaje para responder.
 */
export async function charge(request: Request, env: QuotaEnv, bucket: Bucket): Promise<Gate> {
	const who = await identify(request, env);
	if (who.open) return { ok: true, user: null };
	if (who.user === null) return unknownUser(who);
	const db = env.DB;
	if (!db) return { ok: false, status: 500, error: 'quota_unavailable' };
	try {
		await ensureSchema(db);
		if (!(await confirmedAdult(request, db, who.user)))
			return { ok: false, status: 403, error: 'age_confirmation_required' };
		if (!who.account) {
			if (await takeFree(db, who.user, bucket, freeLimitsFor(env, who.mode)[bucket]))
				return { ok: true, user: who.user, paid: 0 };
			if (who.mode === 'code' || !authEnabled(env))
				return { ok: false, status: 429, error: 'quota_exceeded', bucket };
			return { ok: false, status: 402, error: 'login_required', bucket };
		}
		const cost = costsFromEnv(env)[bucket];
		const id = who.account.id;
		if (cost === 0) {
			// Sin costo, pero solo para quien compró créditos (y le queda saldo).
			if (who.account.credits > 0) return { ok: true, user: who.user, paid: 0 };
			return { ok: false, status: 402, error: 'credits_required', bucket };
		}
		const r = await db
			.prepare('UPDATE users SET credits = credits - ?2 WHERE id = ?1 AND credits >= ?2')
			.bind(id, cost)
			.run();
		if (r.meta.changes < 1) return { ok: false, status: 402, error: 'credits_required', bucket };
		await db
			.prepare(
				'INSERT INTO credit_ledger (user_id, delta, reason, created_at) VALUES (?1, ?2, ?3, ?4)'
			)
			.bind(id, -cost, `use:${bucket}`, Date.now())
			.run();
		return { ok: true, user: who.user, paid: cost, account: id };
	} catch {
		return { ok: false, status: 500, error: 'quota_unavailable' };
	}
}

/**
 * Devuelve lo cobrado cuando el servidor falló por su cuenta (no se gastó crédito de IA): los créditos si
 * pagó con ellos, o la llamada del cupo gratis.
 */
export async function refund(
	env: QuotaEnv,
	gate: Extract<Gate, { ok: true }>,
	bucket: Bucket
): Promise<void> {
	if (!gate.user || !env.DB) return;
	const db = env.DB;
	try {
		if (gate.paid && gate.account) {
			await inBatch(db, [
				db
					.prepare('UPDATE users SET credits = credits + ?2 WHERE id = ?1')
					.bind(gate.account, gate.paid),
				db
					.prepare(
						'INSERT INTO credit_ledger (user_id, delta, reason, created_at) VALUES (?1, ?2, ?3, ?4)'
					)
					.bind(gate.account, gate.paid, `refund:${bucket}`, Date.now())
			]);
			return;
		}
		await db
			.prepare('UPDATE usage SET n = MAX(n - 1, 0) WHERE name = ?1 AND bucket = ?2')
			.bind(gate.user, bucket)
			.run();
	} catch {
		// sin devolución: el cupo queda como estaba
	}
}

/**
 * Suma créditos comprados a una cuenta. `ref` (p. ej. el id del pago) es único: si el aviso del pago llega
 * dos veces, los créditos se suman una sola vez. Devuelve `false` si esa referencia ya estaba.
 */
export async function addCredits(
	db: D1Like,
	userId: string,
	credits: number,
	reason: string,
	ref: string
): Promise<boolean> {
	await ensureSchema(db);
	const before = await db
		.prepare('SELECT 1 AS x FROM credit_ledger WHERE ref = ?1')
		.bind(ref)
		.first<{ x: number }>();
	if (before) return false;
	// En una transacción: el saldo solo sube si la referencia todavía no está en el registro.
	await inBatch(db, [
		db
			.prepare(
				'UPDATE users SET credits = credits + ?2 WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM credit_ledger WHERE ref = ?3)'
			)
			.bind(userId, credits, ref),
		db
			.prepare(
				'INSERT OR IGNORE INTO credit_ledger (user_id, delta, reason, ref, created_at) VALUES (?1, ?2, ?3, ?4, ?5)'
			)
			.bind(userId, credits, reason, ref, Date.now())
	]);
	return true;
}

export interface UsageReport {
	/** Sin códigos ni base de datos: no hay cupos. */
	open: boolean;
	/** `true` si las personas se reconocen por código (y se muestra el campo para escribirlo). */
	codes?: boolean;
	name?: string;
	used?: Record<Bucket, number>;
	limits?: Record<Bucket, number>;
	/** Se puede iniciar sesión (y comprar créditos). */
	auth?: boolean;
	/** La cuenta con la sesión iniciada (`null` si no inició sesión). */
	account?: { email: string; credits: number } | null;
	/** Créditos por llamada una vez agotado el cupo gratis. */
	costs?: Record<Bucket, number>;
	/** Créditos de regalo al crear la cuenta. */
	welcome?: number;
}

/** Consumo de quien hace el pedido (para mostrarlo en el perfil). */
export async function usageFor(
	request: Request,
	env: QuotaEnv
): Promise<Extract<Gate, { ok: false }> | UsageReport> {
	const who = await identify(request, env);
	if (who.open) return { open: true };
	if (who.user === null) return unknownUser(who);
	const used: Record<Bucket, number> = { exercises: 0, characters: 0, images: 0, other: 0 };
	if (env.DB) {
		try {
			await ensureSchema(env.DB);
			const rows = await env.DB.prepare('SELECT bucket, n FROM usage WHERE name = ?1')
				.bind(who.user)
				.all<{ bucket: Bucket; n: number }>();
			for (const row of rows.results) if (row.bucket in used) used[row.bucket] = row.n;
		} catch {
			return { ok: false, status: 500, error: 'quota_unavailable' };
		}
	}
	const report: UsageReport = {
		open: false,
		codes: who.mode === 'code',
		name: who.user,
		used,
		limits: freeLimitsFor(env, who.mode)
	};
	if (who.mode !== 'code' && authEnabled(env)) {
		report.auth = true;
		report.account = who.account
			? { email: who.account.email, credits: who.account.credits }
			: null;
		report.costs = costsFromEnv(env);
		report.welcome = welcomeCredits(env);
	}
	return report;
}
