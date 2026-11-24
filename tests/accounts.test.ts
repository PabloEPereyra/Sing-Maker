// Cuentas, sesiones y créditos contra un SQLite real (el mismo SQL que corre en D1).
import { describe, expect, it } from 'vitest';
import { sqliteD1 } from '../scripts/d1-sqlite';
import {
	authEnabled,
	logout,
	senderFrom,
	sessionAccount,
	sha256,
	startLogin,
	verifyLogin,
	type AuthEnv
} from '../src/lib/server/auth';
import { addCredits, charge, refund, usageFor, type QuotaEnv } from '../src/lib/server/quota';
import {
	canonicalEmail,
	grantWelcome,
	isDisposable,
	networkOf,
	type WelcomeEnv
} from '../src/lib/server/welcome';

const DEVICE = 'dev-device-0123456789';
const URL_ = 'https://vocal.quest/api/x';

function setup(extra: Partial<QuotaEnv & WelcomeEnv> = {}) {
	const db = sqliteD1();
	const env: QuotaEnv & WelcomeEnv = { DB: db, AUTH_DEV_LINKS: '1', ...extra };
	return { db, env };
}

const tokenOf = (link: string) => new URL(link).searchParams.get('login')!;

/** Un pedido con dispositivo y, si hay, la cookie de sesión y la IP. */
const req = (cookie = '', ip = '') =>
	new Request(URL_, {
		method: 'POST',
		headers: {
			'X-Client-Id': DEVICE,
			'X-Adult': '1',
			...(cookie ? { Cookie: cookie } : {}),
			...(ip ? { 'CF-Connecting-IP': ip } : {})
		}
	});

/** Inicia sesión con ese email y devuelve la cookie («vq_session=…»). */
async function login(env: AuthEnv, email = 'Ana@Example.com'): Promise<string> {
	const start = await startLogin(env, { email, lang: 'es', origin: 'https://vocal.quest' });
	if (!start.ok || !start.devLink) throw new Error('sin enlace');
	const r = await verifyLogin(req(), env, { token: tokenOf(start.devLink) });
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
		const sent: { url: string; body: { from: string; to: string; text: string } }[] = [];
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
		expect(sent[0].body.from).toBe('Vocal Quest <h@vq.test>');
		expect(sent[0].body.text).toMatch(/https:\/\/vq\.test\/\?login=/);
	});
});

describe('remitente', () => {
	it('siempre se muestra como Vocal Quest', () => {
		for (const raw of ['hola@vq.test', ' hola@vq.test ', 'hola <hola@vq.test>', '<hola@vq.test>'])
			expect(senderFrom(raw)).toBe('Vocal Quest <hola@vq.test>');
	});
});

describe('cupo sin cuenta y créditos', () => {
	const credits = (db: ReturnType<typeof sqliteD1>) =>
		(db.raw.prepare('SELECT credits FROM users').get() as { credits: number }).credits;
	const userId = (db: ReturnType<typeof sqliteD1>) =>
		(db.raw.prepare('SELECT id FROM users').get() as { id: string }).id;

	it('sin sesión: unos ejercicios gratis, personajes e imágenes piden cuenta', async () => {
		const { env } = setup({ ANON_LIMIT_EXERCISES: '2' });
		expect(await charge(req(), env, 'exercises')).toMatchObject({ ok: true, paid: 0 });
		expect(await charge(req(), env, 'exercises')).toMatchObject({ ok: true, paid: 0 });
		expect(await charge(req(), env, 'exercises')).toEqual({
			ok: false,
			status: 402,
			error: 'login_required',
			bucket: 'exercises'
		});
		for (const b of ['characters', 'images'] as const)
			expect(await charge(req(), env, b)).toMatchObject({ status: 402, error: 'login_required' });
		expect(await usageFor(req(), env)).toMatchObject({
			auth: true,
			account: null,
			welcome: 40,
			limits: { exercises: 2, characters: 0, images: 0, other: 20 }
		});
	});

	it('LIMIT_* no cambia el cupo sin cuenta cuando hay cuentas', async () => {
		const { env } = setup({ LIMIT_CHARACTERS: '5' });
		expect(await charge(req(), env, 'characters')).toMatchObject({ error: 'login_required' });
	});

	it('sin login configurado sigue siendo el cupo de siempre y un tope (429)', async () => {
		const { env } = setup({ AUTH_DEV_LINKS: undefined, LIMIT_CHARACTERS: '1' });
		expect(await charge(req(), env, 'characters')).toMatchObject({ ok: true, paid: 0 });
		expect(await charge(req(), env, 'characters')).toMatchObject({
			status: 429,
			error: 'quota_exceeded'
		});
	});

	it('con sesión todo se paga con créditos, desde el primer uso', async () => {
		const { db, env } = setup({ CREDIT_COST_IMAGES: '2', CREDIT_COST_CHARACTERS: '5' });
		const cookie = await login(env);
		expect(await charge(req(cookie), env, 'exercises')).toMatchObject({
			ok: false,
			status: 402,
			error: 'credits_required'
		});
		expect(await addCredits(db, userId(db), 6, 'purchase', 'pay_1')).toBe(true);
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
		expect(await addCredits(db, userId(db), 250, 'purchase', 'pay_X')).toBe(true);
		expect(await addCredits(db, userId(db), 250, 'purchase', 'pay_X')).toBe(false);
		expect(credits(db)).toBe(250);
	});

	it('si el servidor falla devuelve los créditos cobrados', async () => {
		const { db, env } = setup();
		const cookie = await login(env);
		await addCredits(db, userId(db), 3, 'purchase', 'pay_2');
		const gate = await charge(req(cookie), env, 'exercises');
		expect(gate).toMatchObject({ ok: true, paid: 1 });
		if (gate.ok) await refund(env, gate, 'exercises');
		expect(credits(db)).toBe(3);
	});

	it('lo que cuesta 0 (entrenador, dictado) solo pasa a quien tiene saldo', async () => {
		const { db, env } = setup();
		const cookie = await login(env);
		expect(await charge(req(cookie), env, 'other')).toMatchObject({ error: 'credits_required' });
		await addCredits(db, userId(db), 1, 'purchase', 'pay_3');
		expect(await charge(req(cookie), env, 'other')).toMatchObject({ ok: true, paid: 0 });
		expect(credits(db)).toBe(1);
	});
});

describe('créditos de regalo al crear la cuenta', () => {
	const credits = (db: ReturnType<typeof sqliteD1>, email: string) =>
		(db.raw.prepare('SELECT credits FROM users WHERE email = ?').get(email) as { credits: number })
			.credits;

	/** Entra y pide el regalo, como hace /api/auth-verify. */
	async function claim(env: QuotaEnv & WelcomeEnv, email: string, ip = '') {
		const cookie = await login(env, email);
		const account = await sessionAccount(req(cookie), env);
		if (!account) throw new Error('sin sesión');
		return grantWelcome(env.DB!, env, req(cookie, ip), account);
	}

	it('se da una vez por email y queda en el registro', async () => {
		const { db, env } = setup();
		expect(await claim(env, 'ana@example.com')).toBe('granted');
		expect(await claim(env, 'ana@example.com')).toBe('already');
		expect(credits(db, 'ana@example.com')).toBe(40);
		expect(db.raw.prepare('SELECT delta, reason FROM credit_ledger').all()).toEqual([
			{ delta: 40, reason: 'welcome' }
		]);
	});

	it('las variantes de un email no lo vuelven a dar', async () => {
		const { db, env } = setup();
		expect(await claim(env, 'pablo@gmail.com')).toBe('granted');
		expect(await claim(env, 'p.ab.lo+vq@gmail.com')).toBe('already');
		expect(await claim(env, 'pablo+2@googlemail.com')).toBe('already');
		expect(credits(db, 'p.ab.lo+vq@gmail.com')).toBe(0);
	});

	it('con el regalo en 0 o un email descartable no se da', async () => {
		const { env } = setup();
		expect(await claim(env, 'x@mailinator.com')).toBe('disposable');
		expect(await claim({ ...env, WELCOME_CREDITS: '0' }, 'y@example.com')).toBe('off');
	});

	it('se puede cambiar la cantidad', async () => {
		const { db, env } = setup({ WELCOME_CREDITS: '25' });
		await claim(env, 'ana@example.com');
		expect(credits(db, 'ana@example.com')).toBe(25);
	});

	it('tope por red: una familia entra, una serie de cuentas no', async () => {
		const { db, env } = setup();
		const capped = { ...env, WELCOME_PER_IP: '2' };
		expect(await claim(capped, 'a@example.com', '203.0.113.7')).toBe('granted');
		expect(await claim(capped, 'b@example.com', '203.0.113.7')).toBe('granted');
		expect(await claim(capped, 'c@example.com', '203.0.113.7')).toBe('ip_limit');
		// otra red sí; y en IPv6 cuenta el /64
		expect(await claim(capped, 'd@example.com', '198.51.100.1')).toBe('granted');
		expect(await claim(capped, 'e@example.com', '2001:db8:1:2::1')).toBe('granted');
		expect(await claim(capped, 'f@example.com', '2001:db8:1:2:ffff::9')).toBe('granted');
		expect(await claim(capped, 'g@example.com', '2001:db8:1:2:abcd::1')).toBe('ip_limit');
		// la IP no se guarda, solo su hash
		const stored = JSON.stringify(db.raw.prepare('SELECT * FROM welcome_grants').all());
		expect(stored).not.toContain('203.0.113');
		// los regalos viejos no cuentan
		db.raw.prepare('UPDATE welcome_grants SET created_at = 0').run();
		expect(await claim(capped, 'h@example.com', '203.0.113.7')).toBe('granted');
	});

	it('normaliza emails, reconoce descartables y agrupa la red', () => {
		expect(canonicalEmail(' P.Ablo+test@GMail.com ')).toBe('pablo@gmail.com');
		expect(canonicalEmail('ana.maria+x@example.com')).toBe('ana.maria@example.com');
		expect(isDisposable('a@mailinator.com')).toBe(true);
		expect(isDisposable('a@sub.yopmail.com')).toBe(true);
		expect(isDisposable('a@gmail.com')).toBe(false);
		const ip = (v: string) =>
			networkOf(new Request(URL_, { headers: v ? { 'CF-Connecting-IP': v } : {} }));
		expect(ip('')).toBeNull();
		expect(ip('203.0.113.7')).toBe('203.0.113.7');
		expect(ip('2001:0db8:0001:0002:0:0:0:1')).toBe('2001:db8:1:2');
		expect(ip('2001:db8::1')).toBe('2001:db8:0:0');
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
