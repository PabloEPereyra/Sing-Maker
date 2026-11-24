// Compra de créditos con Dodo Payments. Dodo solo vende paquetes (productos de pago único); el saldo vive en D1.
//   1. /api/checkout crea una sesión de pago para la cuenta con la sesión iniciada y devuelve la URL de Dodo.
//   2. Dodo avisa a /api/dodo-webhook (firmado con Standard Webhooks). Del aviso solo se toma el id del pago:
//      el pago se vuelve a pedir a la API de Dodo, que es la fuente de verdad (estado, productos y metadata).
//   3. Con el pago confirmado se suman los créditos del paquete; el id del pago es la referencia única del
//      registro, así que si el aviso llega varias veces se suma una sola.
//   4. Un reembolso (entero o parcial) o una disputa (contracargo) quita los créditos de esa compra; si la disputa
//      se gana o se cancela, vuelven. También acá manda el estado del pago en la API de Dodo, no el aviso.
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
	/** Lo que pagó la persona, con impuestos, en la unidad mínima de `currency` (centavos). */
	total_amount?: number;
	currency?: string;
	settlement_amount?: number;
	settlement_currency?: string;
	refund_status?: 'partial' | 'full' | null;
	refunds?: DodoRefund[] | null;
	disputes?: { dispute_id?: string; dispute_status?: string }[] | null;
}

interface DodoRefund {
	refund_id?: string;
	status?: string;
	is_partial?: boolean;
	amount?: number | null;
	currency?: string | null;
}

/** Disputas que ya no retienen la plata: con cualquier otro estado, la persona (o su banco) la tiene o la reclama. */
const CLEARED_DISPUTES = new Set(['dispute_won', 'dispute_cancelled']);

/** Créditos que corresponden a los productos del pago, según los paquetes configurados. */
export function creditsFor(payment: DodoPayment, packs: Pack[]): number {
	let total = 0;
	for (const item of payment.product_cart ?? []) {
		const pack = packs.find((p) => p.productId === item.product_id);
		if (pack) total += pack.credits * Math.max(1, Math.floor(item.quantity ?? 1));
	}
	return total;
}

/** Parte del pago que se devolvió, de 0 a 1 (`null` si un reembolso parcial no se puede medir). */
export function refundedShare(payment: DodoPayment): number | null {
	const done = (payment.refunds ?? []).filter((r) => r.status === 'succeeded');
	if (payment.refund_status === 'full' || done.some((r) => r.is_partial === false)) return 1;
	let share = 0;
	for (const r of done) {
		// El monto viene en la moneda del pago o, si no, en la de liquidación.
		const currency = r.currency ?? payment.currency;
		const total =
			currency === payment.currency
				? payment.total_amount
				: currency === payment.settlement_currency
					? payment.settlement_amount
					: undefined;
		if (typeof r.amount !== 'number' || !total || total <= 0) return null;
		share += r.amount / total;
	}
	return Math.min(Math.max(share, 0), 1);
}

/** Intentos de ajustar el saldo si otro pedido lo cambia justo en el medio. */
const RECONCILE_TRIES = 4;

/**
 * Deja los créditos quitados de una compra como corresponde al estado del pago. Es idempotente: se calcula lo que
 * hay que quitar en total (`due`) y solo se aplica la diferencia con lo anterior. El saldo no baja de 0, así que se
 * guarda aparte lo que de verdad se quitó (`taken`): lo que faltó no se cobra de compras futuras, y si la disputa
 * se gana vuelve exactamente lo quitado. Devuelve el cambio en el saldo.
 */
async function reconcile(
	db: D1Like,
	paymentId: string,
	payment: DodoPayment
): Promise<{ known: boolean; delta: number }> {
	const bought = await db
		.prepare("SELECT user_id, delta FROM credit_ledger WHERE ref = ?1 AND reason = 'purchase'")
		.bind(paymentId)
		.first<{ user_id: string; delta: number }>();
	if (!bought) return { known: false, delta: 0 };

	const share = refundedShare(payment);
	if (share === null) throw new Error(`No se pudo medir el reembolso parcial de ${paymentId}`);
	const refunded = Math.round(bought.delta * share);
	const disputed = (payment.disputes ?? []).some(
		(d) => !CLEARED_DISPUTES.has(d.dispute_status ?? '')
	);
	const due = disputed ? bought.delta : refunded;

	// Reembolso hecho con la versión anterior (sin payment_reversals): ya se quitó el paquete entero.
	const legacy = await db
		.prepare('SELECT delta FROM credit_ledger WHERE ref = ?1')
		.bind(`refund:${paymentId}`)
		.first<{ delta: number }>();
	const before = legacy ? -legacy.delta : 0;
	if (due === 0 && before === 0) {
		const row = await db
			.prepare('SELECT 1 AS x FROM payment_reversals WHERE payment_id = ?1')
			.bind(paymentId)
			.first<{ x: number }>();
		if (!row) return { known: true, delta: 0 };
	}
	await db
		.prepare(
			"INSERT OR IGNORE INTO payment_reversals (payment_id, user_id, due, taken, op) VALUES (?1, ?2, ?3, ?3, '')"
		)
		.bind(paymentId, bought.user_id, before)
		.run();

	for (let i = 0; i < RECONCILE_TRIES; i++) {
		const row = await db
			.prepare(
				'SELECT r.due AS due, r.taken AS taken, r.op AS op, u.credits AS credits FROM payment_reversals r JOIN users u ON u.id = r.user_id WHERE r.payment_id = ?1'
			)
			.bind(paymentId)
			.first<{ due: number; taken: number; op: string; credits: number }>();
		if (!row) return { known: false, delta: 0 };
		if (row.due === due) return { known: true, delta: 0 };
		const delta =
			due > row.due
				? -Math.min(Math.max(row.credits, 0), due - row.due)
				: row.taken - Math.min(row.taken, due);
		const reason = delta > 0 ? 'restored' : disputed ? 'dispute' : 'refund';
		const op = crypto.randomUUID();
		// La primera consulta solo se aplica si nadie tocó la fila ni el saldo desde que se leyeron; las otras dos,
		// solo si se aplicó la primera (queda su `op`).
		const statements = [
			db
				.prepare(
					'UPDATE payment_reversals SET due = ?2, taken = taken - ?3, op = ?4 WHERE payment_id = ?1 AND op = ?5 AND (SELECT credits FROM users WHERE id = payment_reversals.user_id) = ?6'
				)
				.bind(paymentId, due, delta, op, row.op, row.credits)
		];
		if (delta !== 0)
			statements.push(
				db
					.prepare(
						'UPDATE users SET credits = credits + ?2 WHERE id = ?1 AND EXISTS (SELECT 1 FROM payment_reversals WHERE payment_id = ?3 AND op = ?4)'
					)
					.bind(bought.user_id, delta, paymentId, op),
				db
					.prepare(
						'INSERT INTO credit_ledger (user_id, delta, reason, ref, created_at) SELECT ?1, ?2, ?3, ?4, ?5 WHERE EXISTS (SELECT 1 FROM payment_reversals WHERE payment_id = ?6 AND op = ?7)'
					)
					.bind(
						bought.user_id,
						delta,
						reason,
						`reversal:${paymentId}:${op}`,
						Date.now(),
						paymentId,
						op
					)
			);
		await inBatch(db, statements);
		const applied = await db
			.prepare('SELECT 1 AS x FROM payment_reversals WHERE payment_id = ?1 AND op = ?2')
			.bind(paymentId, op)
			.first<{ x: number }>();
		if (applied) return { known: true, delta };
	}
	throw new Error(`No se pudo ajustar el saldo por ${paymentId}`);
}

export type WebhookResult =
	{ handled: true; credits?: number; duplicate?: boolean } | { handled: false; reason: string };

interface WebhookEvent {
	type?: string;
	data?: { payment_id?: string; refund_id?: string; dispute_id?: string };
}

/**
 * Procesa un aviso ya verificado. Un pago confirmado suma los créditos a la cuenta de su metadata (o, si faltara,
 * a la del email del pago); un reembolso o una disputa ajusta los créditos de esa compra (ver `reconcile`). Si algo
 * no se puede resolver todavía, lanza para que Dodo reintente el aviso.
 */
export async function handleWebhook(
	env: PaymentsEnv,
	event: WebhookEvent,
	fetchImpl: typeof fetch = fetch
): Promise<WebhookResult> {
	const db = env.DB;
	if (!db) return { handled: false, reason: 'no_db' };
	const paid = event.type === 'payment.succeeded';
	const refunded = event.type === 'refund.succeeded';
	const disputed = !!event.type?.startsWith('dispute.');
	if (!paid && !refunded && !disputed) return { handled: false, reason: 'ignored' };
	const paymentId = event.data?.payment_id;
	if (!paymentId) return { handled: false, reason: 'no_payment_id' };

	const res = await dodo(env, `/payments/${encodeURIComponent(paymentId)}`, {}, fetchImpl);
	if (!res.ok) throw new Error(`Dodo respondió ${res.status} al pedir el pago`);
	const payment = (await res.json()) as DodoPayment;
	await ensureSchema(db);

	if (!paid) {
		// Si el pago todavía no muestra lo que dice el aviso, se reintenta más tarde.
		const listed = refunded
			? payment.refund_status === 'full' ||
				(payment.refunds ?? []).some(
					(r) =>
						r.status === 'succeeded' &&
						(!event.data?.refund_id || r.refund_id === event.data.refund_id)
				)
			: (payment.disputes ?? []).some(
					(d) => !event.data?.dispute_id || d.dispute_id === event.data.dispute_id
				);
		if (!listed) throw new Error(`El pago ${paymentId} todavía no muestra ${event.type}`);
		const r = await reconcile(db, paymentId, payment);
		if (!r.known) return { handled: false, reason: 'unknown_payment' };
		return r.delta === 0 ? { handled: true, duplicate: true } : { handled: true, credits: r.delta };
	}

	if (payment.status !== 'succeeded') return { handled: false, reason: 'not_succeeded' };
	const credits = creditsFor(payment, parsePacks(env.DODO_PACKS));
	if (credits <= 0) return { handled: false, reason: 'no_pack' };
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
	// El aviso del reembolso o de la disputa pudo llegar antes que este.
	await reconcile(db, paymentId, payment);
	return { handled: true, credits, duplicate: !added };
}
