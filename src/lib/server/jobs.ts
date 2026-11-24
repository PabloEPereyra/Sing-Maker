// Trabajos de precio fijo: crear o retocar un personaje u objeto se cobra una sola vez al empezar (jobPrice en pricing.ts) y las
// imágenes que haga falta repetir ya están incluidas, hasta un tope por hoja.
//
// Al terminar, el navegador avisa cómo salió (settleJob):
// - `done`: queda el precio fijo.
// - `cancelled`: se devuelve lo que no se usó (el precio menos las imágenes pedidas, a su costo suelto).
// - `failed`: se devuelve todo, pero el aviso viene del navegador, así que solo se cree si los pedidos lo muestran
//   (ninguna hoja, o una hoja con todos sus intentos gastados) y hasta MAX_FAILED_PER_DAY por día. Si no, vale
//   como cancelado.
// Un trabajo que nunca se cierra (se cerró la pestaña) vence y se trata como cancelado (settleStale).
//
// Los pedidos se cuentan al empezar, antes de generar la imagen, y un trabajo cerrado no acepta más: no se puede
// pedir todo a la vez y cerrarlo antes de que lleguen las imágenes.
// Contadores (tabla usage, nombre «job:<id>»): «hero», «move», «jump»… = intentos; «blocked:<x>» = los que frenó el
// filtro de contenido; «error:<x>» = fallas del servidor (esas no cuentan como intento).
import type { Bucket, JobKind } from '../pricing';
import { ensureSchema, inBatch, type D1Like } from './db';

export const JOB_HEADER = 'X-Job-Id';
export const JOB_TTL_MS = 30 * 60_000;
export const MAX_FAILED_PER_DAY = 2;
/** Intentos por hoja: los mismos que hace el navegador (MAX_TRIES en character/create.ts). */
const SHEET_TRIES = 3;

export type Outcome = 'done' | 'cancelled' | 'failed';

/** Cuántas veces se puede pedir cada imagen. */
const LIMITS: Record<JobKind, Record<string, number>> = {
	character: { hero: 2, move: SHEET_TRIES, jump: SHEET_TRIES, stand: SHEET_TRIES },
	'character-photo': { move: SHEET_TRIES, jump: SHEET_TRIES, stand: SHEET_TRIES },
	retouch: { hero: 1, move: SHEET_TRIES, jump: SHEET_TRIES, stand: SHEET_TRIES },
	// Una sola hoja, la que sea: los intentos se comparten.
	'retouch-sheet': { sheet: SHEET_TRIES },
	item: { hero: 1, item: SHEET_TRIES },
	'item-photo': { item: SHEET_TRIES }
};

/** Con qué nombre se cuenta un pedido en ese tipo de trabajo. */
const slotFor = (kind: JobKind, what: string): string =>
	kind === 'retouch-sheet' && (what === 'move' || what === 'jump' || what === 'stand')
		? 'sheet'
		: what;

interface JobRow {
	id: string;
	user_id: string;
	kind: JobKind;
	price: number;
	outcome: string;
}

const counterName = (id: string) => `job:${id}`;

/** Cobra y abre un trabajo; `null` si no le alcanzan los créditos. */
export async function startJob(
	db: D1Like,
	userId: string,
	kind: JobKind,
	price: number,
	now = Date.now()
): Promise<string | null> {
	await ensureSchema(db);
	const id = crypto.randomUUID();
	await inBatch(db, [
		db
			.prepare(
				"INSERT INTO character_jobs (id, user_id, kind, price, state, outcome, refunded, op, created_at) SELECT ?1, ?2, ?3, ?4, 'open', '', 0, '', ?5 WHERE EXISTS (SELECT 1 FROM users WHERE id = ?2 AND credits >= ?4)"
			)
			.bind(id, userId, kind, price, now),
		db
			.prepare(
				'UPDATE users SET credits = credits - ?2 WHERE id = ?1 AND EXISTS (SELECT 1 FROM character_jobs WHERE id = ?3)'
			)
			.bind(userId, price, id),
		db
			.prepare(
				'INSERT INTO credit_ledger (user_id, delta, reason, ref, created_at) SELECT ?1, ?2, ?3, ?4, ?5 WHERE EXISTS (SELECT 1 FROM character_jobs WHERE id = ?6)'
			)
			.bind(userId, -price, `use:job:${kind}`, `job:${id}`, now, id)
	]);
	const row = await db
		.prepare('SELECT 1 AS x FROM character_jobs WHERE id = ?1')
		.bind(id)
		.first<{ x: number }>();
	return row ? id : null;
}

/**
 * Anota un pedido de imagen en un trabajo abierto de esa cuenta. Devuelve con qué nombre quedó contado, o `null` si
 * el trabajo no es suyo, está cerrado o vencido, o ya gastó sus intentos.
 */
export async function takeJob(
	db: D1Like,
	userId: string,
	id: string,
	what: string,
	now = Date.now()
): Promise<string | null> {
	const job = await db
		.prepare('SELECT kind FROM character_jobs WHERE id = ?1 AND user_id = ?2')
		.bind(id, userId)
		.first<{ kind: JobKind }>();
	if (!job) return null;
	const slot = slotFor(job.kind, what);
	const limit = LIMITS[job.kind]?.[slot] ?? 0;
	if (limit <= 0) return null;
	const r = await db
		.prepare(
			"INSERT INTO usage (name, bucket, n) SELECT ?1, ?2, 1 WHERE EXISTS (SELECT 1 FROM character_jobs WHERE id = ?4 AND user_id = ?5 AND state = 'open' AND created_at > ?6) ON CONFLICT(name, bucket) DO UPDATE SET n = n + 1 WHERE n < ?3"
		)
		.bind(counterName(id), slot, limit, id, userId, now - JOB_TTL_MS)
		.run();
	return r.meta.changes >= 1 ? slot : null;
}

/** El pedido no dio imagen: la frenó el filtro (`blocked`, cuenta como intento) o falló el servidor (no cuenta). */
export async function noteFailure(
	db: D1Like,
	id: string,
	slot: string,
	why: 'blocked' | 'error'
): Promise<void> {
	const add = db
		.prepare(
			'INSERT INTO usage (name, bucket, n) VALUES (?1, ?2, 1) ON CONFLICT(name, bucket) DO UPDATE SET n = n + 1'
		)
		.bind(counterName(id), `${why}:${slot}`);
	if (why === 'blocked') return void (await add.run());
	await inBatch(db, [
		add,
		db
			.prepare('UPDATE usage SET n = MAX(n - 1, 0) WHERE name = ?1 AND bucket = ?2')
			.bind(counterName(id), slot)
	]);
}

/** Cierra un trabajo y devuelve los créditos que correspondan. Repetirlo no devuelve de nuevo. */
export async function settleJob(
	db: D1Like,
	userId: string,
	id: string,
	outcome: Outcome,
	costs: Record<Bucket, number>,
	now = Date.now()
): Promise<number> {
	await ensureSchema(db);
	// Desde acá no acepta más pedidos, y vale el primer aviso.
	await db
		.prepare(
			"UPDATE character_jobs SET state = 'closing', outcome = ?3 WHERE id = ?1 AND user_id = ?2 AND state = 'open'"
		)
		.bind(id, userId, outcome)
		.run();
	const job = await db
		.prepare(
			"SELECT id, user_id, kind, price, outcome FROM character_jobs WHERE id = ?1 AND user_id = ?2 AND state = 'closing'"
		)
		.bind(id, userId)
		.first<JobRow>();
	if (!job) return 0;
	const refund = await refundFor(db, job, costs, now);
	const op = crypto.randomUUID();
	const mine = 'EXISTS (SELECT 1 FROM character_jobs WHERE id = ?1 AND op = ?2)';
	const statements = [
		db
			.prepare(
				"UPDATE character_jobs SET state = 'settled', refunded = ?3, op = ?2 WHERE id = ?1 AND state = 'closing'"
			)
			.bind(id, op, refund)
	];
	if (refund > 0)
		statements.push(
			db
				.prepare(`UPDATE users SET credits = credits + ?3 WHERE id = ?4 AND ${mine}`)
				.bind(id, op, refund, userId),
			db
				.prepare(
					`INSERT INTO credit_ledger (user_id, delta, reason, ref, created_at) SELECT ?4, ?3, ?5, ?6, ?7 WHERE ${mine}`
				)
				.bind(id, op, refund, userId, `refund:job:${job.kind}`, `job:${id}:refund`, now)
		);
	await inBatch(db, statements);
	const done = await db
		.prepare('SELECT 1 AS x FROM character_jobs WHERE id = ?1 AND op = ?2')
		.bind(id, op)
		.first<{ x: number }>();
	return done ? refund : 0;
}

async function refundFor(
	db: D1Like,
	job: JobRow,
	costs: Record<Bucket, number>,
	now: number
): Promise<number> {
	if (job.outcome === 'done') return 0;
	const { results } = await db
		.prepare('SELECT bucket, n FROM usage WHERE name = ?1')
		.bind(counterName(job.id))
		.all<{ bucket: string; n: number }>();
	const n = new Map(results.map((r) => [r.bucket, r.n]));
	const get = (key: string) => n.get(key) ?? 0;
	const slots = Object.keys(LIMITS[job.kind]);
	const sheets = slots.filter((s) => s !== 'hero');

	if (job.outcome === 'failed') {
		const believable =
			sheets.every((s) => get(s) === 0) ||
			sheets.some((s) => get(s) + get(`error:${s}`) >= LIMITS[job.kind][s]);
		const today = await db
			.prepare(
				"SELECT COUNT(*) AS n FROM character_jobs WHERE user_id = ?1 AND id != ?3 AND outcome = 'failed' AND (state = 'closing' OR refunded >= price) AND created_at > ?2"
			)
			.bind(job.user_id, now - 86400_000, job.id)
			.first<{ n: number }>();
		if (believable && (today?.n ?? 0) < MAX_FAILED_PER_DAY) return job.price;
	}

	const used = slots.reduce(
		(sum, s) =>
			sum +
			Math.max(get(s) - get(`blocked:${s}`), 0) * (s === 'hero' ? costs.characters : costs.images),
		0
	);
	return Math.max(job.price - used, 0);
}

/** Cierra los trabajos que quedaron abiertos más de JOB_TTL_MS (p. ej. se cerró la pestaña). */
export async function settleStale(
	db: D1Like,
	userId: string,
	costs: Record<Bucket, number>,
	now = Date.now()
): Promise<void> {
	const { results } = await db
		.prepare(
			"SELECT id FROM character_jobs WHERE user_id = ?1 AND state != 'settled' AND created_at <= ?2 LIMIT 20"
		)
		.bind(userId, now - JOB_TTL_MS)
		.all<{ id: string }>();
	for (const { id } of results) await settleJob(db, userId, id, 'cancelled', costs, now);
}
