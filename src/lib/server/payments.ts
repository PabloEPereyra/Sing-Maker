// Compra de créditos con Dodo Payments. Dodo solo vende paquetes (productos de pago único); el saldo vive en D1.
//   1. /api/checkout crea una sesión de pago para la cuenta con la sesión iniciada y devuelve la URL de Dodo.
//   2. Dodo avisa a /api/dodo-webhook (firmado con Standard Webhooks). Del aviso solo se toma el id del pago:
//      el pago se vuelve a pedir a la API de Dodo, que es la fuente de verdad (estado, productos y metadata).
//   3. Con el pago confirmado se suman los créditos del paquete; el id del pago es la referencia única del
//      registro, así que si el aviso llega varias veces se suma una sola.
// Variables: DODO_API_KEY, DODO_WEBHOOK_SECRET (whsec_…), DODO_MODE (test | live; por defecto test) y
// DODO_PACKS con los paquetes: «id_producto:créditos:precio», separados por coma (p. ej. «pdt_A:250:10»).
import { ensureSchema, inBatch, type D1Like } from './db';
import { addCredits } from './quota';

export interface PaymentsEnv {
	DB?: D1Like;
	DODO_API_KEY?: string;
	DODO_WEBHOOK_SECRET?: string;
	DODO_MODE?: string;
	DODO_PACKS?: string;
}

export interface Pack {
	productId: string;
	credits: number;
	/** Precio para mostrar (en dólares); el que cobra es el del producto en Dodo. */
	price: number;
}

/** «pdt_A:250:10, pdt_B:600:20» → paquetes válidos, en ese orden. */
export function parsePacks(raw: string | undefined): Pack[] {
	const packs: Pack[] = [];
	for (const part of (raw ?? '').split(',')) {
		const [productId, credits, price] = part.trim().split(':');
		const c = Number(credits);
		const p = Number(price);
		if (productId && Number.isInteger(c) && c > 0 && Number.isFinite(p) && p > 0)
			packs.push({ productId, credits: c, price: p });
	}
	return packs;
}

/** Se puede comprar si hay clave de Dodo, secreto del webhook, paquetes y base. */
export const paymentsEnabled = (env: PaymentsEnv): boolean =>
	!!env.DB &&
	!!env.DODO_API_KEY &&
	!!env.DODO_WEBHOOK_SECRET &&
	parsePacks(env.DODO_PACKS).length > 0;

const apiBase = (env: PaymentsEnv): string =>
	env.DODO_MODE === 'live' ? 'https://live.dodopayments.com' : 'https://test.dodopayments.com';

function dodo(
	env: PaymentsEnv,
	path: string,
	init: RequestInit = {},
	fetchImpl: typeof fetch = fetch
) {
	return fetchImpl(`${apiBase(env)}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${env.DODO_API_KEY}`,
			'Content-Type': 'application/json',
			...(init.headers ?? {})
		}
	});
}

/** Crea la sesión de pago de un paquete para esa cuenta y devuelve la URL de Dodo. */
export async function createCheckout(
	env: PaymentsEnv,
	input: { account: { id: string; email: string }; productId: unknown; origin: string },
	fetchImpl: typeof fetch = fetch
): Promise<{ ok: true; url: string } | { ok: false; status: number; error: string }> {
	if (!paymentsEnabled(env)) return { ok: false, status: 503, error: 'payments_unavailable' };
	const pack = parsePacks(env.DODO_PACKS).find((p) => p.productId === input.productId);
	if (!pack) return { ok: false, status: 400, error: 'unknown_pack' };
	const res = await dodo(
		env,
		'/checkouts',
		{
			method: 'POST',
			body: JSON.stringify({
				product_cart: [{ product_id: pack.productId, quantity: 1 }],
				customer: { email: input.account.email },
				return_url: `${input.origin.replace(/\/$/, '')}/?purchase=done`,
				metadata: { user_id: input.account.id }
			})
		},
		fetchImpl
	);
	const data = (await res.json().catch(() => null)) as { checkout_url?: string | null } | null;
	if (!res.ok || !data?.checkout_url) return { ok: false, status: 502, error: 'checkout_failed' };
	return { ok: true, url: data.checkout_url };
}

// ---------- Webhook (Standard Webhooks) ----------

/** Tolerancia del reloj para el aviso firmado (la de las librerías de Standard Webhooks). */
const TOLERANCE_S = 5 * 60;

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

function bytesToBase64(bytes: Uint8Array): string {
	let s = '';
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s);
}

/** Compara dos textos en tiempo constante (para no filtrar la firma por lo que tarda). */
function sameText(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

/** Firma de Standard Webhooks: HMAC-SHA256 de «id.timestamp.cuerpo» con el secreto (base64, sin «whsec_»). */
export async function signWebhook(
	secret: string,
	id: string,
	timestamp: string,
	body: string
): Promise<string> {
	const key = await crypto.subtle.importKey(
		'raw',
		base64ToBytes(secret.replace(/^whsec_/, '')),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	const sig = await crypto.subtle.sign(
		'HMAC',
		key,
		new TextEncoder().encode(`${id}.${timestamp}.${body}`)
	);
	return bytesToBase64(new Uint8Array(sig));
}

/** Revisa la firma y la hora del aviso. `now` en segundos. */
export async function verifyWebhook(
	secret: string,
	headers: Headers,
	body: string,
	now = Math.floor(Date.now() / 1000)
): Promise<boolean> {
	const id = headers.get('webhook-id') ?? '';
	const timestamp = headers.get('webhook-timestamp') ?? '';
	const signatures = headers.get('webhook-signature') ?? '';
	const ts = Number(timestamp);
	if (!id || !Number.isFinite(ts) || Math.abs(now - ts) > TOLERANCE_S) return false;
	const expected = await signWebhook(secret, id, timestamp, body);
	return signatures
		.split(' ')
		.some((entry) => entry.startsWith('v1,') && sameText(entry.slice(3), expected));
}

interface DodoPayment {
	payment_id?: string;
	status?: string;
	metadata?: Record<string, unknown> | null;
	product_cart?: { product_id?: string; quantity?: number }[] | null;
	customer?: { email?: string } | null;
}

/** Créditos que corresponden a los productos del pago, según los paquetes configurados. */
export function creditsFor(payment: DodoPayment, packs: Pack[]): number {
	let total = 0;
	for (const item of payment.product_cart ?? []) {
		const pack = packs.find((p) => p.productId === item.product_id);
		if (pack) total += pack.credits * Math.max(1, Math.floor(item.quantity ?? 1));
	}
	return total;
}

export type WebhookResult =
	{ handled: true; credits?: number; duplicate?: boolean } | { handled: false; reason: string };

/**
 * Procesa un aviso ya verificado. Un pago confirmado suma los créditos a la cuenta de su metadata (o, si
 * faltara, a la del email del pago); un reembolso los descuenta (sin bajar el saldo de 0).
 */
export async function handleWebhook(
	env: PaymentsEnv,
	event: { type?: string; data?: { payment_id?: string } },
	fetchImpl: typeof fetch = fetch
): Promise<WebhookResult> {
	const db = env.DB;
	if (!db) return { handled: false, reason: 'no_db' };
	const paymentId = event.data?.payment_id;
	if (event.type === 'payment.succeeded') {
		if (!paymentId) return { handled: false, reason: 'no_payment_id' };
		const res = await dodo(env, `/payments/${encodeURIComponent(paymentId)}`, {}, fetchImpl);
		if (!res.ok) throw new Error(`Dodo respondió ${res.status} al pedir el pago`);
		const payment = (await res.json()) as DodoPayment;
		if (payment.status !== 'succeeded') return { handled: false, reason: 'not_succeeded' };
		const credits = creditsFor(payment, parsePacks(env.DODO_PACKS));
		if (credits <= 0) return { handled: false, reason: 'no_pack' };
		await ensureSchema(db);
		let userId = typeof payment.metadata?.user_id === 'string' ? payment.metadata.user_id : '';
		if (userId) {
			const exists = await db
				.prepare('SELECT id FROM users WHERE id = ?1')
				.bind(userId)
				.first<{ id: string }>();
			if (!exists) userId = '';
		}
		if (!userId && payment.customer?.email) {
			const byEmail = await db
				.prepare('SELECT id FROM users WHERE email = ?1')
				.bind(payment.customer.email.trim().toLowerCase())
				.first<{ id: string }>();
			userId = byEmail?.id ?? '';
		}
		if (!userId) return { handled: false, reason: 'unknown_user' };
		const added = await addCredits(db, userId, credits, 'purchase', paymentId);
		return { handled: true, credits, duplicate: !added };
	}
	if (event.type === 'refund.succeeded') {
		if (!paymentId) return { handled: false, reason: 'no_payment_id' };
		await ensureSchema(db);
		const bought = await db
			.prepare('SELECT user_id, delta FROM credit_ledger WHERE ref = ?1')
			.bind(paymentId)
			.first<{ user_id: string; delta: number }>();
		if (!bought) return { handled: false, reason: 'unknown_payment' };
		const ref = `refund:${paymentId}`;
		const done = await db
			.prepare('SELECT 1 AS x FROM credit_ledger WHERE ref = ?1')
			.bind(ref)
			.first<{ x: number }>();
		if (done) return { handled: true, duplicate: true };
		await inBatch(db, [
			db
				.prepare(
					'UPDATE users SET credits = MAX(credits - ?2, 0) WHERE id = ?1 AND NOT EXISTS (SELECT 1 FROM credit_ledger WHERE ref = ?3)'
				)
				.bind(bought.user_id, bought.delta, ref),
			db
				.prepare(
					'INSERT OR IGNORE INTO credit_ledger (user_id, delta, reason, ref, created_at) VALUES (?1, ?2, ?3, ?4, ?5)'
				)
				.bind(bought.user_id, -bought.delta, 'refund', ref, Date.now())
		]);
		return { handled: true, credits: -bought.delta };
	}
	return { handled: false, reason: 'ignored' };
}
