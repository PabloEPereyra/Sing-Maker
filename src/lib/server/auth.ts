// Cuentas con inicio de sesión por enlace mágico: la persona escribe su email, le llega un enlace que vale
// 15 minutos y una sola vez, y al abrirlo queda una sesión en una cookie HttpOnly. Sin contraseñas.
// El enlace lleva a la app (/?login=…) y es la app la que confirma con un POST: así los programas que revisan
// los enlaces de los emails no gastan el token al abrirlo.
// En la base solo se guardan hashes de los tokens (de sesión y de enlace), nunca los tokens.
import { z } from 'zod';
import { ensureSchema, type D1Like } from './db';

export interface AuthEnv {
	DB?: D1Like;
	/** Clave de Resend para mandar los emails. */
	RESEND_API_KEY?: string;
	/** Remitente verificado en Resend, p. ej. «Vocal Quest <hola@vocal.quest>». */
	AUTH_EMAIL_FROM?: string;
	/** Solo desarrollo: «1» devuelve el enlace en la respuesta en vez de mandarlo por email. */
	AUTH_DEV_LINKS?: string;
}

export const SESSION_COOKIE = 'vq_session';
const SESSION_DAYS = 60;
const LINK_MINUTES = 15;
/** Enlaces que se pueden pedir por email y por hora. */
const LINKS_PER_HOUR = 5;

export interface Account {
	id: string;
	email: string;
	credits: number;
}

/** Hay inicio de sesión si hay base y una forma de entregar el enlace. */
export const authEnabled = (env: AuthEnv): boolean =>
	!!env.DB && ((!!env.RESEND_API_KEY && !!env.AUTH_EMAIL_FROM) || env.AUTH_DEV_LINKS === '1');

const EmailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());

function base64url(bytes: Uint8Array): string {
	let s = '';
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomToken(): string {
	return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function sha256(text: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function readCookie(request: Request, name: string): string {
	for (const part of (request.headers.get('Cookie') ?? '').split(';')) {
		const i = part.indexOf('=');
		if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
	}
	return '';
}

function cookie(request: Request, value: string, maxAge: number): string {
	const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
	return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export type AuthError = { ok: false; status: number; error: string };

/** Pide un enlace de inicio de sesión para ese email. */
export async function startLogin(
	env: AuthEnv,
	input: { email: unknown; lang: 'es' | 'en'; origin: string },
	fetchImpl: typeof fetch = fetch
): Promise<{ ok: true; devLink?: string } | AuthError> {
	const db = env.DB;
	if (!db || !authEnabled(env)) return { ok: false, status: 503, error: 'auth_unavailable' };
	const parsed = EmailSchema.safeParse(input.email);
	if (!parsed.success) return { ok: false, status: 400, error: 'invalid_email' };
	const email = parsed.data;
	await ensureSchema(db);
	const now = Date.now();
	const recent = await db
		.prepare('SELECT COUNT(*) AS n FROM login_tokens WHERE email = ?1 AND created_at > ?2')
		.bind(email, now - 3600_000)
		.first<{ n: number }>();
	if ((recent?.n ?? 0) >= LINKS_PER_HOUR)
		return { ok: false, status: 429, error: 'too_many_links' };

	const token = randomToken();
	await db
		.prepare(
			'INSERT INTO login_tokens (token_hash, email, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)'
		)
		.bind(await sha256(token), email, now, now + LINK_MINUTES * 60_000)
		.run();
	const link = `${input.origin.replace(/\/$/, '')}/?login=${token}`;
	if (env.RESEND_API_KEY && env.AUTH_EMAIL_FROM) {
		const res = await fetchImpl('https://api.resend.com/emails', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${env.RESEND_API_KEY}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				from: env.AUTH_EMAIL_FROM,
				to: email,
				...loginEmail(link, input.lang)
			})
		});
		if (!res.ok) return { ok: false, status: 502, error: 'email_failed' };
		return { ok: true };
	}
	return { ok: true, devLink: link };
}

function loginEmail(
	link: string,
	lang: 'es' | 'en'
): { subject: string; html: string; text: string } {
	const es = lang === 'es';
	const subject = es ? 'Tu enlace para entrar a Vocal Quest' : 'Your Vocal Quest sign-in link';
	const intro = es
		? `Toca el botón para entrar a Vocal Quest. El enlace vale ${LINK_MINUTES} minutos y sirve una sola vez.`
		: `Tap the button to sign in to Vocal Quest. The link works for ${LINK_MINUTES} minutes, once.`;
	const button = es ? 'Entrar a Vocal Quest' : 'Sign in to Vocal Quest';
	const ignore = es
		? 'Si no lo pediste, ignora este email.'
		: "If you didn't ask for it, ignore this email.";
	return {
		subject,
		text: `${intro}\n\n${link}\n\n${ignore}`,
		html: `<p>${intro}</p><p><a href="${link}" style="display:inline-block;padding:12px 20px;background:#3a55c8;color:#fff;border-radius:10px;text-decoration:none;font-weight:bold">${button}</a></p><p style="color:#666;font-size:13px">${ignore}</p>`
	};
}

/**
 * Confirma un enlace: lo marca usado, crea la cuenta si no existe, abre una sesión y suma a la cuenta lo que
 * ya había gastado este dispositivo del cupo gratis (entrar no vuelve a dar el cupo).
 */
export async function verifyLogin(
	request: Request,
	env: AuthEnv,
	input: { token: unknown; device?: string | null }
): Promise<{ ok: true; account: Account; setCookie: string } | AuthError> {
	const db = env.DB;
	if (!db) return { ok: false, status: 503, error: 'auth_unavailable' };
	if (typeof input.token !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(input.token))
		return { ok: false, status: 400, error: 'invalid_link' };
	await ensureSchema(db);
	const now = Date.now();
	const hash = await sha256(input.token);
	const used = await db
		.prepare(
			'UPDATE login_tokens SET used = 1 WHERE token_hash = ?1 AND used = 0 AND expires_at > ?2'
		)
		.bind(hash, now)
		.run();
	if (used.meta.changes < 1) return { ok: false, status: 400, error: 'invalid_link' };
	const row = await db
		.prepare('SELECT email FROM login_tokens WHERE token_hash = ?1')
		.bind(hash)
		.first<{ email: string }>();
	if (!row) return { ok: false, status: 400, error: 'invalid_link' };

	await db
		.prepare(
			'INSERT INTO users (id, email, credits, created_at) VALUES (?1, ?2, 0, ?3) ON CONFLICT(email) DO NOTHING'
		)
		.bind(crypto.randomUUID(), row.email, now)
		.run();
	const account = await db
		.prepare('SELECT id, email, credits FROM users WHERE email = ?1')
		.bind(row.email)
		.first<Account>();
	if (!account) return { ok: false, status: 500, error: 'auth_unavailable' };

	if (input.device && /^[A-Za-z0-9_-]{16,64}$/.test(input.device)) {
		await db
			.prepare(
				'INSERT INTO usage (name, bucket, n) SELECT ?1, bucket, n FROM usage WHERE name = ?2 AND true ON CONFLICT(name, bucket) DO UPDATE SET n = MAX(n, excluded.n)'
			)
			.bind(`user:${account.id}`, `device:${input.device}`)
			.run();
	}

	const session = randomToken();
	await db
		.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?1, ?2, ?3)')
		.bind(await sha256(session), account.id, now + SESSION_DAYS * 86400_000)
		.run();
	return { ok: true, account, setCookie: cookie(request, session, SESSION_DAYS * 86400) };
}

/** La cuenta de la sesión de la cookie, o `null` si no hay sesión válida. */
export async function sessionAccount(request: Request, env: AuthEnv): Promise<Account | null> {
	const token = readCookie(request, SESSION_COOKIE);
	if (!env.DB || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
	await ensureSchema(env.DB);
	return env.DB.prepare(
		'SELECT u.id AS id, u.email AS email, u.credits AS credits FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?1 AND s.expires_at > ?2'
	)
		.bind(await sha256(token), Date.now())
		.first<Account>();
}

/** Cierra la sesión de la cookie y devuelve la cookie que la borra. */
export async function logout(request: Request, env: AuthEnv): Promise<string> {
	const token = readCookie(request, SESSION_COOKIE);
	if (env.DB && token) {
		await ensureSchema(env.DB);
		await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1')
			.bind(await sha256(token))
			.run();
	}
	return cookie(request, '', 0);
}
