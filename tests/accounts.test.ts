// Cuentas, sesiones y créditos contra un SQLite real (el mismo SQL que corre en D1).
import { describe, expect, it } from 'vitest';
import { sqliteD1 } from '../scripts/d1-sqlite';
import {
	authEnabled,
	logout,
	sessionAccount,
	sha256,
	startLogin,
	verifyLogin,
	type AuthEnv
} from '../src/lib/server/auth';
import { addCredits, charge, refund, usageFor, type QuotaEnv } from '../src/lib/server/quota';

const DEVICE = 'dev-device-0123456789';
const URL_ = 'https://vocal.quest/api/x';

function setup(extra: Partial<QuotaEnv> = {}) {
	const db = sqliteD1();
	const env: QuotaEnv = { DB: db, AUTH_DEV_LINKS: '1', ...extra };
	return { db, env };
}

const tokenOf = (link: string) => new URL(link).searchParams.get('login')!;

/** Un pedido con dispositivo y, si hay, la cookie de sesión. */
const req = (cookie = '') =>
	new Request(URL_, {
		method: 'POST',
		headers: { 'X-Client-Id': DEVICE, 'X-Adult': '1', ...(cookie ? { Cookie: cookie } : {}) }
	});

/** Inicia sesión con ese email y devuelve la cookie («vq_session=…»). */
async function login(env: AuthEnv, email = 'Ana@Example.com'): Promise<string> {
	const start = await startLogin(env, { email, lang: 'es', origin: 'https://vocal.quest' });
	if (!start.ok || !start.devLink) throw new Error('sin enlace');
	const r = await verifyLogin(req(), env, { token: tokenOf(start.devLink), device: DEVICE });
	if (!r.ok) throw new Error(r.error);
	return r.setCookie.split(';')[0];
}

describe('inicio de sesión por enlace', () => {
	it('solo hay login con base y una forma de mandar el enlace', () => {
		expect(authEnabled({})).toBe(false);
		expect(authEnabled({ DB: sqliteD1() })).toBe(false);
		expect(authEnabled({ DB: sqliteD1(), RESEND_API_KEY: 'k' })).toBe(false);
		expect(authEnabled({ DB: sqliteD1(), RESEND_API_KEY: 'k', AUTH_EMAIL_FROM: 'a@b.c' })).toBe(
			true
		);
		expect(authEnabled({ DB: sqliteD1(), AUTH_DEV_LINKS: '1' })).toBe(true);
	});

	it('rechaza emails inválidos', async () => {
		const { env } = setup();
		const r = await startLogin(env, { email: 'no-es-email', lang: 'es', origin: 'https://x' });
		expect(r).toMatchObject({ ok: false, status: 400, error: 'invalid_email' });
	});

	it('el enlace sirve una sola vez, y en la base solo queda su hash', async () => {
		const { db, env } = setup();
		const start = await startLogin(env, { email: 'a@b.co', lang: 'es', origin: 'https://vq.test' });
		expect(start.ok && start.devLink).toMatch(/^https:\/\/vq\.test\/\?login=[\w-]{40,}$/);
		const token = tokenOf((start as { devLink: string }).devLink);
		const stored = db.raw.prepare('SELECT token_hash FROM login_tokens').all() as {
			token_hash: string;
		}[];
		expect(stored).toEqual([{ token_hash: await sha256(token) }]);

		const first = await verifyLogin(req(), env, { token });
		expect(first).toMatchObject({ ok: true, account: { email: 'a@b.co', credits: 0 } });
		expect((first as { setCookie: string }).setCookie).toMatch(
			/^vq_session=[\w-]+; Path=\/; HttpOnly; SameSite=Lax; Max-Age=\d+; Secure$/
		);
		expect(await verifyLogin(req(), env, { token })).toMatchObject({
			ok: false,
			error: 'invalid_link'
		});
	});

	it('un enlace vencido no sirve', async () => {
		const { db, env } = setup();
		const start = await startLogin(env, { email: 'a@b.co', lang: 'en', origin: 'https://x' });
		db.raw.prepare('UPDATE login_tokens SET expires_at = 0').run();
		const r = await verifyLogin(req(), env, {
			token: tokenOf((start as { devLink: string }).devLink)
		});
		expect(r).toMatchObject({ ok: false, error: 'invalid_link' });
	});

	it('limita los enlaces por email y por hora', async () => {
		const { env } = setup();
		const ask = () => startLogin(env, { email: 'a@b.co', lang: 'es', origin: 'https://x' });
		for (let i = 0; i < 5; i++) expect((await ask()).ok).toBe(true);
		expect(await ask()).toMatchObject({ ok: false, status: 429, error: 'too_many_links' });
	});

	it('el email se normaliza: la misma cuenta con mayúsculas o espacios', async () => {
		const { db, env } = setup();
		await login(env, 'Ana@Example.com');
		await login(env, '  ana@example.com ');
		expect(db.raw.prepare('SELECT email FROM users').all()).toEqual([{ email: 'ana@example.com' }]);
	});

	it('la cookie identifica la cuenta hasta cerrar sesión', async () => {
		const { env } = setup();
		const cookie = await login(env);
		expect(await sessionAccount(req(cookie), env)).toMatchObject({ email: 'ana@example.com' });
		expect(await sessionAccount(req('vq_session=otra-cosa-que-no-existe-xx'), env)).toBeNull();
		expect(await logout(req(cookie), env)).toMatch(/^vq_session=; .*Max-Age=0/);
		expect(await sessionAccount(req(cookie), env)).toBeNull();
	});

	it('manda el email por Resend con el enlace', async () => {
		const { env } = setup({
			AUTH_DEV_LINKS: undefined,
			RESEND_API_KEY: 'k',
			AUTH_EMAIL_FROM: 'VQ <h@vq.test>'
		});
		const sent: { url: string; body: { to: string; text: string } }[] = [];
		const fake = (async (url: string, init: RequestInit) => {
			sent.push({ url, body: JSON.parse(String(init.body)) });
			return new Response('{}', { status: 200 });
		}) as unknown as typeof fetch;
		const r = await startLogin(
			env,
			{ email: 'a@b.co', lang: 'es', origin: 'https://vq.test' },
			fake
		);
		expect(r).toEqual({ ok: true });
		expect(sent[0].url).toBe('https://api.resend.com/emails');
		expect(sent[0].body.to).toBe('a@b.co');
		expect(sent[0].body.text).toMatch(/https:\/\/vq\.test\/\?login=/);
	});
});

describe('cupo gratis y créditos', () => {
	const limits = {
		LIMIT_EXERCISES: '2',
		LIMIT_CHARACTERS: '1',
		LIMIT_IMAGES: '0',
		LIMIT_OTHER: '1'
	};

	it('sin sesión, al terminar el cupo gratis pide iniciar sesión', async () => {
		const { env } = setup(limits);
		expect(await charge(req(), env, 'exercises')).toMatchObject({ ok: true, paid: 0 });
		expect(await charge(req(), env, 'exercises')).toMatchObject({ ok: true, paid: 0 });
		expect(await charge(req(), env, 'exercises')).toEqual({
			ok: false,
			status: 402,
			error: 'login_required',
			bucket: 'exercises'
		});
	});

	it('sin login configurado sigue siendo un tope (429), como antes', async () => {
		const { env } = setup({ ...limits, AUTH_DEV_LINKS: undefined });
		await charge(req(), env, 'characters');
		expect(await charge(req(), env, 'characters')).toMatchObject({
			status: 429,
			error: 'quota_exceeded'
		});
	});

	it('entrar no devuelve el cupo gratis que ya gastó el dispositivo', async () => {
		const { env } = setup(limits);
		await charge(req(), env, 'exercises');
		await charge(req(), env, 'exercises');
		const cookie = await login(env);
		expect(await charge(req(cookie), env, 'exercises')).toMatchObject({
			ok: false,
			error: 'credits_required'
		});
	});

	it('con créditos descuenta según el costo, y se niega si no alcanza', async () => {
		const { db, env } = setup({ ...limits, CREDIT_COST_IMAGES: '2', CREDIT_COST_CHARACTERS: '5' });
		const cookie = await login(env);
		const { id } = db.raw.prepare('SELECT id FROM users').get() as { id: string };
		expect(await addCredits(db, id, 6, 'purchase', 'pay_1')).toBe(true);

		await charge(req(cookie), env, 'characters'); // gratis (límite 1)
		expect(await charge(req(cookie), env, 'characters')).toMatchObject({ ok: true, paid: 5 });
		expect(await charge(req(cookie), env, 'images')).toMatchObject({
			ok: false,
			status: 402,
			error: 'credits_required'
		});
		const report = await usageFor(req(cookie), env);
		expect(report).toMatchObject({ auth: true, account: { email: 'ana@example.com', credits: 1 } });
		const ledger = db.raw.prepare('SELECT delta, reason FROM credit_ledger ORDER BY id').all();
		expect(ledger).toEqual([
			{ delta: 6, reason: 'purchase' },
			{ delta: -5, reason: 'use:characters' }
		]);
	});

	it('el mismo pago no suma créditos dos veces', async () => {
		const { db, env } = setup();
		await login(env);
		const { id } = db.raw.prepare('SELECT id FROM users').get() as { id: string };
		expect(await addCredits(db, id, 250, 'purchase', 'pay_X')).toBe(true);
		expect(await addCredits(db, id, 250, 'purchase', 'pay_X')).toBe(false);
		expect(db.raw.prepare('SELECT credits FROM users').get()).toEqual({ credits: 250 });
	});

	it('si el servidor falla devuelve los créditos cobrados', async () => {
		const { db, env } = setup({ ...limits, LIMIT_EXERCISES: '0' });
		const cookie = await login(env);
		const { id } = db.raw.prepare('SELECT id FROM users').get() as { id: string };
		await addCredits(db, id, 3, 'purchase', 'pay_2');
		const gate = await charge(req(cookie), env, 'exercises');
		expect(gate).toMatchObject({ ok: true, paid: 1 });
		if (gate.ok) await refund(env, gate, 'exercises');
		expect(db.raw.prepare('SELECT credits FROM users').get()).toEqual({ credits: 3 });
	});

	it('lo que cuesta 0 (entrenador, dictado) solo pasa del cupo a quien tiene saldo', async () => {
		const { db, env } = setup(limits);
		const cookie = await login(env);
		await charge(req(cookie), env, 'other'); // gratis (límite 1)
		expect(await charge(req(cookie), env, 'other')).toMatchObject({ error: 'credits_required' });
		const { id } = db.raw.prepare('SELECT id FROM users').get() as { id: string };
		await addCredits(db, id, 1, 'purchase', 'pay_3');
		expect(await charge(req(cookie), env, 'other')).toMatchObject({ ok: true, paid: 0 });
		expect(db.raw.prepare('SELECT credits FROM users').get()).toEqual({ credits: 1 });
	});
});

describe('declaración de edad (18+, términos de Meta)', () => {
	const bare = (device = DEVICE, adult = false) =>
		new Request(URL_, {
			method: 'POST',
			headers: { 'X-Client-Id': device, ...(adult ? { 'X-Adult': '1' } : {}) }
		});

	it('sin declaración no deja usar la IA ni gasta el cupo', async () => {
		const { db, env } = setup();
		expect(await charge(bare(), env, 'exercises')).toEqual({
			ok: false,
			status: 403,
			error: 'age_confirmation_required'
		});
		const used = await db.prepare('SELECT COUNT(*) AS n FROM usage').bind().first<{ n: number }>();
		expect(used?.n).toBe(0);
	});

	it('registra la declaración con su fecha y después alcanza sin el encabezado', async () => {
		const { db, env } = setup();
		expect(await charge(bare(DEVICE, true), env, 'exercises')).toMatchObject({ ok: true });
		const row = await db
			.prepare('SELECT confirmed_at FROM age_confirmations WHERE name = ?1')
			.bind(`device:${DEVICE}`)
			.first<{ confirmed_at: number }>();
		expect(row?.confirmed_at).toBeGreaterThan(0);
		expect(await charge(bare(), env, 'exercises')).toMatchObject({ ok: true });
		expect(await charge(bare('otro-dispositivo-0123456'), env, 'exercises')).toMatchObject({
			status: 403
		});
	});
});
