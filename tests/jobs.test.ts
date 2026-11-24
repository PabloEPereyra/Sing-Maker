// Precio fijo de personajes y objetos, contra un SQLite real: cobro, reintentos incluidos y devoluciones.
import { describe, expect, it } from 'vitest';
import { sqliteD1 } from '../scripts/d1-sqlite';
import { CREDIT_COSTS, jobPrice, type JobKind } from '../src/lib/pricing';
import { startLogin, verifyLogin } from '../src/lib/server/auth';
import {
	JOB_TTL_MS,
	MAX_FAILED_PER_DAY,
	settleJob,
	startJob,
	takeJob,
	type Outcome
} from '../src/lib/server/jobs';
import {
	addCredits,
	blocked,
	charge,
	closeJob,
	openJob,
	refund,
	usageFor,
	type Bucket,
	type QuotaEnv
} from '../src/lib/server/quota';

const URL_ = 'https://vocal.quest/api/character';
const req = (cookie = '', job = '', adult = true) =>
	new Request(URL_, {
		method: 'POST',
		headers: {
			'X-Client-Id': 'dev-device-0123456789',
			...(adult ? { 'X-Adult': '1' } : {}),
			...(cookie ? { Cookie: cookie } : {}),
			...(job ? { 'X-Job-Id': job } : {})
		}
	});

/** Una cuenta con sesión y créditos. */
async function account(credits: number, extra: Partial<QuotaEnv> = {}, email = 'ana@example.com') {
	const db = sqliteD1();
	const env: QuotaEnv = { DB: db, AUTH_DEV_LINKS: '1', ...extra };
	const cookie = await login(env, email);
	const { id } = db.raw.prepare('SELECT id FROM users').get() as { id: string };
	if (credits) await addCredits(db, id, credits, 'purchase', 'pay_1');
	const saldo = () =>
		(db.raw.prepare('SELECT credits FROM users WHERE id = ?').get(id) as { credits: number })
			.credits;
	const start = async (kind: JobKind = 'character') => {
		const r = await openJob(req(cookie), env, kind);
		if (!r.ok || !r.job) throw new Error('no se abrió');
		return r.job;
	};
	const image = (job: string, what: string) =>
		charge(req(cookie, job), env, what === 'hero' ? 'characters' : 'images', what);
	const settle = async (job: string, outcome: Outcome) => {
		const r = await closeJob(req(cookie), env, job, outcome);
		return r.ok ? r.refunded : -1;
	};
	return { db, env, cookie, id, saldo, start, image, settle };
}

async function login(env: QuotaEnv, email: string): Promise<string> {
	const s = await startLogin(env, { email, lang: 'es', origin: 'https://vocal.quest' });
	if (!s.ok || !s.devLink) throw new Error('sin enlace');
	const r = await verifyLogin(req(), env, {
		token: new URL(s.devLink).searchParams.get('login')!
	});
	if (!r.ok) throw new Error(r.error);
	return r.setCookie.split(';')[0];
}

describe('precio fijo', () => {
	it('los precios', () => {
		expect(jobPrice('character')).toBe(13);
		expect(jobPrice('character-photo')).toBe(8);
		expect(jobPrice('retouch')).toBe(13);
		expect(jobPrice('retouch-sheet')).toBe(2);
		expect(jobPrice('item')).toBe(7);
		expect(jobPrice('item-photo')).toBe(2);
	});

	it('se cobra una vez y las imágenes, con sus reintentos, no se cobran aparte', async () => {
		const { saldo, start, image, settle } = await account(40);
		const job = await start();
		expect(saldo()).toBe(27);
		for (const what of ['hero', 'hero', 'move', 'move', 'move', 'jump', 'stand'])
			expect(await image(job, what)).toMatchObject({ ok: true, paid: 0 });
		expect(await settle(job, 'done')).toBe(0);
		expect(saldo()).toBe(27);
	});

	it('sin créditos suficientes no empieza ni cobra nada', async () => {
		const { env, cookie, saldo } = await account(12);
		expect(await openJob(req(cookie), env, 'character')).toMatchObject({
			ok: false,
			status: 402,
			error: 'credits_required'
		});
		expect(saldo()).toBe(12);
	});

	it('dos inicios a la vez no dejan el saldo negativo', async () => {
		const { env, cookie, saldo } = await account(20);
		const r = await Promise.all(
			Array.from({ length: 4 }, () => openJob(req(cookie), env, 'character'))
		);
		expect(r.filter((x) => x.ok)).toHaveLength(1);
		expect(saldo()).toBe(7);
	});

	it('las imágenes tienen tope: 3 por hoja, y desde una foto no hay imagen principal', async () => {
		const { start, image } = await account(60);
		const job = await start();
		const tries = [];
		for (let i = 0; i < 5; i++) tries.push((await image(job, 'move')).ok);
		expect(tries).toEqual([true, true, true, false, false]);
		expect(await image(job, 'item')).toMatchObject({ status: 409, error: 'job_closed' });
		const photo = await start('character-photo');
		expect((await image(photo, 'hero')).ok).toBe(false);
		// Retocar una hoja: los 3 intentos son de una sola hoja o repartidos, no 3 por cada una
		const sheet = await start('retouch-sheet');
		const n = [];
		for (const what of ['move', 'jump', 'stand', 'move']) n.push((await image(sheet, what)).ok);
		expect(n).toEqual([true, true, true, false]);
	});

	it('un trabajo cerrado, vencido o de otra cuenta no da imágenes', async () => {
		const a = await account(60);
		const job = await a.start();
		await a.settle(job, 'done');
		expect(await a.image(job, 'hero')).toMatchObject({ status: 409 });
		const old = await a.start();
		expect(await takeJob(a.db, a.id, old, 'hero', Date.now() + JOB_TTL_MS + 1000)).toBeNull();
		expect(await takeJob(a.db, 'otra-cuenta', old, 'hero')).toBeNull();
		expect(await settleJob(a.db, 'otra-cuenta', old, 'failed', CREDIT_COSTS)).toBe(0);
		expect((await a.image('no-existe', 'hero')).ok).toBe(false);
	});

	it('sin X-Job-Id se sigue cobrando cada imagen (versiones viejas en caché)', async () => {
		const { image, saldo } = await account(20);
		expect(await image('', 'hero')).toMatchObject({ ok: true, paid: 5 });
		expect(await image('', 'move')).toMatchObject({ ok: true, paid: 2 });
		expect(saldo()).toBe(13);
	});

	it('el encabezado no sirve para fondos ni ejercicios', async () => {
		const { start, env, cookie, saldo } = await account(40);
		const job = await start();
		expect(await charge(req(cookie, job), env, 'images')).toMatchObject({ paid: 2 });
		expect(await charge(req(cookie, job), env, 'exercises')).toMatchObject({ paid: 1 });
		expect(saldo()).toBe(24);
	});
});

describe('devoluciones', () => {
	it('cancelar devuelve lo que no se pidió', async () => {
		const { saldo, start, image, settle } = await account(13);
		const job = await start();
		await image(job, 'hero');
		await image(job, 'move');
		expect(await settle(job, 'cancelled')).toBe(6);
		expect(saldo()).toBe(6);
		// repetirlo, o cambiar el motivo después, no devuelve más
		expect(await settle(job, 'cancelled')).toBe(0);
		expect(await settle(job, 'failed')).toBe(0);
		expect(saldo()).toBe(6);
	});

	it('cancelar antes de pedir nada devuelve todo, y con muchos reintentos no cobra de más', async () => {
		const { saldo, start, image, settle } = await account(26);
		expect(await settle(await start(), 'cancelled')).toBe(13);
		const job = await start();
		for (const w of ['hero', 'hero', 'move', 'move', 'move', 'jump', 'stand']) await image(job, w);
		expect(await settle(job, 'cancelled')).toBe(0);
		expect(saldo()).toBe(13);
	});

	it('si falla después de gastar los intentos de una hoja, devuelve todo', async () => {
		const { saldo, start, image, settle } = await account(13);
		const job = await start();
		for (const w of ['hero', 'move', 'move', 'move', 'jump', 'stand']) await image(job, w);
		expect(await settle(job, 'failed')).toBe(13);
		expect(saldo()).toBe(13);
	});

	it('si falla la imagen principal (sin hojas), devuelve todo', async () => {
		const { start, image, settle } = await account(13);
		const job = await start();
		await image(job, 'hero');
		expect(await settle(job, 'failed')).toBe(13);
	});

	it('decir que falló con todas las hojas pedidas una vez no devuelve todo', async () => {
		const { saldo, start, image, settle } = await account(13);
		const job = await start();
		for (const w of ['hero', 'move', 'jump', 'stand']) await image(job, w);
		expect(await settle(job, 'failed')).toBe(2);
		expect(saldo()).toBe(2);
	});

	it('la devolución completa por falla tiene tope diario', async () => {
		const { start, image, settle } = await account(100);
		const out = [];
		for (let i = 0; i < MAX_FAILED_PER_DAY + 1; i++) {
			const job = await start();
			await image(job, 'hero');
			out.push(await settle(job, 'failed'));
		}
		expect(out).toEqual([13, 13, 8]);
	});

	it('cerrar varios a la vez no esquiva el tope diario', async () => {
		const { start, image, settle } = await account(100);
		const jobs = [];
		for (let i = 0; i < 5; i++) {
			const job = await start();
			await image(job, 'hero');
			jobs.push(job);
		}
		const out = await Promise.all(jobs.map((j) => settle(j, 'failed')));
		expect(out.filter((n) => n === 13).length).toBeLessThanOrEqual(MAX_FAILED_PER_DAY);
	});

	it('las devoluciones completas que se están cerrando también cuentan para el tope', async () => {
		const { db, start, image, settle } = await account(100);
		for (let i = 0; i < MAX_FAILED_PER_DAY; i++) {
			const job = await start();
			db.raw
				.prepare("UPDATE character_jobs SET state = 'closing', outcome = 'failed' WHERE id = ?")
				.run(job);
		}
		const job = await start();
		await image(job, 'hero');
		expect(await settle(job, 'failed')).toBe(8);
	});

	it('el mismo trabajo cerrado varias veces a la vez devuelve una sola vez', async () => {
		const { saldo, start, settle } = await account(13);
		const job = await start();
		const out = await Promise.all(Array.from({ length: 5 }, () => settle(job, 'cancelled')));
		expect(out.reduce((a, b) => a + b, 0)).toBe(13);
		expect(saldo()).toBe(13);
	});

	it('una falla del servidor no gasta intento, y lo bloqueado por el filtro no se cobra', async () => {
		const { env, start, image, settle } = await account(13);
		const job = await start();
		for (let i = 0; i < 4; i++) {
			const gate = await image(job, 'move');
			expect(gate.ok).toBe(true);
			if (gate.ok) await refund(env, gate, 'images');
		}
		const gate = await image(job, 'hero');
		if (gate.ok) await blocked(env, gate);
		expect(await settle(job, 'cancelled')).toBe(13);
	});

	it('tres fallas del servidor en una hoja valen como fallo aunque las otras hayan salido', async () => {
		const { env, start, image, settle } = await account(13);
		const job = await start();
		for (const w of ['hero', 'jump', 'stand']) await image(job, w);
		for (let i = 0; i < 3; i++) {
			const gate = await image(job, 'move');
			if (gate.ok) await refund(env, gate, 'images');
		}
		expect(await settle(job, 'failed')).toBe(13);
	});

	it('lo que quedó abierto se cierra al vencer y devuelve lo no usado', async () => {
		const { db, env, cookie, id, saldo } = await account(13);
		const job = (await startJob(db, id, 'character', 13, Date.now() - JOB_TTL_MS - 1000))!;
		expect(job).toBeTruthy();
		expect(saldo()).toBe(0);
		expect(await usageFor(req(cookie), env)).toMatchObject({ account: { credits: 13 } });
		expect(saldo()).toBe(13);
		await usageFor(req(cookie), env);
		expect(saldo()).toBe(13);
	});

	it('cada movimiento queda en el registro y cuadra con el saldo', async () => {
		const { db, saldo, start, image, settle } = await account(40);
		const a = await start();
		await image(a, 'hero');
		await settle(a, 'cancelled');
		await settle(await start('item'), 'done');
		const { total } = db.raw.prepare('SELECT SUM(delta) AS total FROM credit_ledger').get() as {
			total: number;
		};
		expect(total).toBe(saldo());
		expect(saldo()).toBe(40 - 5 - 7);
	});
});

describe('quién puede empezar', () => {
	it('con el saldo justo, las llamadas auxiliares siguen andando hasta terminar', async () => {
		const { env, cookie, start, saldo } = await account(13);
		await start();
		expect(saldo()).toBe(0);
		expect(await charge(req(cookie), env, 'other')).toMatchObject({ ok: true });
	});

	it('sin saldo ni gasto reciente, las auxiliares siguen cerradas', async () => {
		const { db, env, cookie, start } = await account(13);
		await start();
		db.raw.prepare('UPDATE credit_ledger SET created_at = 0').run();
		expect(await charge(req(cookie), env, 'other')).toMatchObject({ error: 'credits_required' });
	});

	it('sin sesión pide cuenta antes de gastar nada', async () => {
		const { env } = await account(0);
		expect(await openJob(req(), env, 'character')).toMatchObject({
			ok: false,
			status: 402,
			error: 'login_required'
		});
	});

	it('sin cuentas (o con cupo sin sesión) se cuenta cada imagen, como siempre', async () => {
		expect(await openJob(req(), {}, 'character')).toEqual({ ok: true, job: null, price: 0 });
		const env: QuotaEnv = { DB: sqliteD1() };
		expect(await openJob(req(), env, 'character')).toMatchObject({ ok: true, job: null });
		const gate = await charge(req(), env, 'characters' as Bucket, 'hero');
		expect(gate).toMatchObject({ ok: true, paid: 0 });
	});

	it('pide la declaración de edad', async () => {
		const { env, cookie } = await account(40);
		expect(await openJob(req(cookie, '', false), env, 'character')).toMatchObject({
			status: 403,
			error: 'age_confirmation_required'
		});
	});
});
