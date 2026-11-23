// Créditos de regalo al crear la cuenta. Es lo que reemplaza al cupo gratis por tipo de uso cuando hay cuentas,
// y por eso es también el freno contra quien abre ventanas privadas para crear personajes sin pagar:
// - una vez por email, contando sus variantes: «ana+1@gmail.com» y «a.na@gmail.com» son «ana@gmail.com»;
// - sin regalo para los dominios de email descartable (la cuenta se crea igual y puede comprar créditos);
// - como mucho WELCOME_PER_IP regalos por IP cada WELCOME_IP_DAYS días (una familia entra; una serie, no).
// De la IP y del email normalizado solo se guarda un hash.
import { WELCOME_IP_DAYS, WELCOME_PER_IP } from '../pricing';
import { sha256 } from './auth';
import { ensureSchema, type D1Like } from './db';
import { addCredits, welcomeCredits } from './quota';

export interface WelcomeEnv {
	WELCOME_CREDITS?: string;
	WELCOME_PER_IP?: string;
	/** Se mezcla con la IP antes del hash, para que no se pueda revertir probando todas las IP. */
	IP_HASH_SALT?: string;
}

/**
 * `granted`: se sumaron. `already`: ese email (o una variante) ya lo recibió. `disposable`: email descartable.
 * `ip_limit`: muchas cuentas desde la misma red. `off`: el regalo está en 0.
 */
export type WelcomeResult = 'granted' | 'already' | 'disposable' | 'ip_limit' | 'off';

const positiveInt = (raw: string | undefined, fallback: number): number => {
	const n = Number(raw);
	return raw !== undefined && raw !== '' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
};

const GMAIL = new Set(['gmail.com', 'googlemail.com']);

/**
 * La forma canónica de un email para el regalo: minúsculas, sin la parte «+algo» y, en Gmail, sin puntos
 * (Gmail entrega en la misma casilla). Solo se usa para comparar; la cuenta guarda el email tal como llegó.
 */
export function canonicalEmail(email: string): string {
	const clean = email.trim().toLowerCase();
	const at = clean.lastIndexOf('@');
	if (at < 1) return clean;
	let local = clean.slice(0, at);
	let domain = clean.slice(at + 1);
	const plus = local.indexOf('+');
	if (plus > 0) local = local.slice(0, plus);
	if (GMAIL.has(domain)) {
		local = local.replace(/\./g, '');
		domain = 'gmail.com';
	}
	return `${local}@${domain}`;
}

/** Servicios de email descartable más comunes (no es exhaustiva: el tope por IP cubre el resto). */
const DISPOSABLE = new Set([
	'10minutemail.com',
	'10minutemail.net',
	'20minutemail.com',
	'burnermail.io',
	'discard.email',
	'dispostable.com',
	'emailondeck.com',
	'fakeinbox.com',
	'getairmail.com',
	'getnada.com',
	'guerrillamail.com',
	'guerrillamail.net',
	'guerrillamail.org',
	'guerrillamailblock.com',
	'grr.la',
	'harakirimail.com',
	'inboxkitten.com',
	'maildrop.cc',
	'mailinator.com',
	'mailinator.net',
	'mailnesia.com',
	'mailpoof.com',
	'mintemail.com',
	'mohmal.com',
	'moakt.com',
	'mytemp.email',
	'nada.email',
	'sharklasers.com',
	'spam4.me',
	'spamgourmet.com',
	'temp-mail.io',
	'temp-mail.org',
	'tempail.com',
	'tempmail.com',
	'tempmail.dev',
	'tempmail.net',
	'tempmailo.com',
	'tempr.email',
	'throwawaymail.com',
	'trashmail.com',
	'trashmail.de',
	'yopmail.com',
	'yopmail.fr',
	'yopmail.net'
]);

/** ¿Es de un servicio de email descartable? También cuenta un subdominio (x.mailinator.com). */
export function isDisposable(email: string): boolean {
	const domain = email.trim().toLowerCase().split('@').pop() ?? '';
	const parts = domain.split('.');
	for (let i = 0; i < parts.length - 1; i++) if (DISPOSABLE.has(parts.slice(i).join('.'))) return true;
	return false;
}

/**
 * La red de quien hace el pedido, según Cloudflare (`CF-Connecting-IP`): la IPv4 entera o, en IPv6, el prefijo
 * /64 (cada casa recibe un /64 y puede cambiar el resto a gusto). `null` si no hay IP (desarrollo local).
 */
export function networkOf(request: Request): string | null {
	const ip = request.headers.get('CF-Connecting-IP')?.trim().toLowerCase() ?? '';
	if (!ip) return null;
	if (!ip.includes(':')) return ip;
	// Completa los «::» para quedarse con los 4 primeros grupos.
	const [head, tail = ''] = ip.split('::');
	const h = head ? head.split(':') : [];
	const t = ip.includes('::') ? (tail ? tail.split(':') : []) : [];
	const groups = ip.includes('::') ? [...h, ...Array(8 - h.length - t.length).fill('0'), ...t] : h;
	return groups
		.slice(0, 4)
		.map((g) => g.replace(/^0+(?=.)/, ''))
		.join(':');
}

/**
 * Da el regalo a la cuenta si corresponde. Se llama en cada inicio de sesión: como la referencia del regalo es
 * única por email canónico, repetirlo no suma nada (y las cuentas creadas antes del regalo lo reciben al entrar).
 */
export async function grantWelcome(
	db: D1Like,
	env: WelcomeEnv,
	request: Request,
	account: { id: string; email: string }
): Promise<WelcomeResult> {
	const credits = welcomeCredits(env);
	if (credits <= 0) return 'off';
	await ensureSchema(db);
	const ref = `welcome:${await sha256(canonicalEmail(account.email))}`;
	const before = await db
		.prepare('SELECT 1 AS x FROM credit_ledger WHERE ref = ?1')
		.bind(ref)
		.first<{ x: number }>();
	if (before) return 'already';
	if (isDisposable(account.email)) return 'disposable';

	const network = networkOf(request);
	const perIp = positiveInt(env.WELCOME_PER_IP, WELCOME_PER_IP);
	const now = Date.now();
	let ipHash: string | null = null;
	if (network && perIp > 0) {
		ipHash = await sha256(`ip:${network}|${env.IP_HASH_SALT ?? ''}`);
		const recent = await db
			.prepare('SELECT COUNT(*) AS n FROM welcome_grants WHERE ip_hash = ?1 AND created_at > ?2')
			.bind(ipHash, now - WELCOME_IP_DAYS * 86400_000)
			.first<{ n: number }>();
		if ((recent?.n ?? 0) >= perIp) return 'ip_limit';
	}
	if (!(await addCredits(db, account.id, credits, 'welcome', ref))) return 'already';
	if (ipHash)
		await db
			.prepare('INSERT INTO welcome_grants (ip_hash, created_at) VALUES (?1, ?2)')
			.bind(ipHash, now)
			.run();
	return 'granted';
}
