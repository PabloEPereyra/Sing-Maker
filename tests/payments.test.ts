// Compra de créditos con Dodo: firma de los avisos, sesión de pago y suma/descuento de créditos.
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sqliteD1 } from '../scripts/d1-sqlite';
import {
	createCheckout,
	creditsFor,
	handleWebhook,
	parsePacks,
	paymentsEnabled,
	refundedShare,
	signWebhook,
	verifyWebhook,
	type PaymentsEnv
} from '../src/lib/server/payments';

const SECRET_BYTES = Buffer.from('secreto-de-prueba-para-webhooks!');
const SECRET = `whsec_${SECRET_BYTES.toString('base64')}`;
const PACKS = 'pdt_small:250:10, pdt_big:600:20';

function setup(): { db: ReturnType<typeof sqliteD1>; env: PaymentsEnv; userId: string } {
	const db = sqliteD1();
	db.raw.exec(
		'CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, credits INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)'
	);
	db.raw.prepare("INSERT INTO users VALUES ('u1', 'ana@example.com', 0, 0)").run();
	return {
		db,
		env: { DB: db, DODO_API_KEY: 'k', DODO_WEBHOOK_SECRET: SECRET, DODO_PACKS: PACKS },
		userId: 'u1'
	};
}

/** fetch falso: responde lo que diga `route` y anota los pedidos. */
function fakeFetch(route: (url: string, init?: RequestInit) => { status?: number; body: unknown }) {
	const calls: { url: string; init?: RequestInit }[] = [];
	const impl = (async (url: string, init?: RequestInit) => {
		calls.push({ url, init });
		const r = route(url, init);
		return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
	}) as unknown as typeof fetch;
	return { impl, calls };
}

const credits = (db: ReturnType<typeof sqliteD1>) =>
	(db.raw.prepare("SELECT credits FROM users WHERE id = 'u1'").get() as { credits: number })
		.credits;

describe('paquetes', () => {
	it('lee «producto:créditos:precio» e ignora lo inválido', () => {
		expect(parsePacks('pdt_a:250:10, pdt_b:x:5, :1:1, pdt_c:600:19.99')).toEqual([
			{ productId: 'pdt_a', credits: 250, price: 10 },
			{ productId: 'pdt_c', credits: 600, price: 19.99 }
		]);
	});

	it('solo se vende con clave, secreto, paquetes y base', () => {
		const { env } = setup();
		expect(paymentsEnabled(env)).toBe(true);
		expect(paymentsEnabled({ ...env, DODO_WEBHOOK_SECRET: '' })).toBe(false);
		expect(paymentsEnabled({ ...env, DODO_PACKS: '' })).toBe(false);
	});

	it('suma los créditos de los productos conocidos por cantidad', () => {
		const packs = parsePacks(PACKS);
		expect(
			creditsFor(
				{
					product_cart: [
						{ product_id: 'pdt_small', quantity: 2 },
						{ product_id: 'otro', quantity: 1 }
					]
				},
				packs
			)
		).toBe(500);
	});
});

describe('firma de los avisos (Standard Webhooks)', () => {
	const body = '{"type":"payment.succeeded"}';
	const headers = (sig: string, ts: number, id = 'msg_1') =>
		new Headers({ 'webhook-id': id, 'webhook-timestamp': String(ts), 'webhook-signature': sig });

	it('coincide con un HMAC-SHA256 calculado aparte', async () => {
		const expected = createHmac('sha256', SECRET_BYTES)
			.update(`msg_1.1700000000.${body}`)
			.digest('base64');
		expect(await signWebhook(SECRET, 'msg_1', '1700000000', body)).toBe(expected);
	});

	it('acepta una firma válida aunque venga junto a otras', async () => {
		const sig = await signWebhook(SECRET, 'msg_1', '1700000000', body);
		expect(
			await verifyWebhook(SECRET, headers(`v1,AAAA v1,${sig}`, 1700000000), body, 1700000100)
		).toBe(true);
	});

	it('rechaza cuerpo cambiado, firma de otro secreto y avisos viejos', async () => {
		const sig = await signWebhook(SECRET, 'msg_1', '1700000000', body);
		expect(
			await verifyWebhook(SECRET, headers(`v1,${sig}`, 1700000000), body + ' ', 1700000000)
		).toBe(false);
		const other = await signWebhook('whsec_b3RybyBzZWNyZXRv', 'msg_1', '1700000000', body);
		expect(await verifyWebhook(SECRET, headers(`v1,${other}`, 1700000000), body, 1700000000)).toBe(
			false
		);
		expect(
			await verifyWebhook(SECRET, headers(`v1,${sig}`, 1700000000), body, 1700000000 + 301)
		).toBe(false);
	});
});

describe('sesión de pago', () => {
	it('pide a Dodo el paquete con el email, la vuelta a la app y la cuenta en la metadata', async () => {
		const { env } = setup();
		const { impl, calls } = fakeFetch(() => ({
			body: { session_id: 's', checkout_url: 'https://pay/x' }
		}));
		const r = await createCheckout(
			env,
			{
				account: { id: 'u1', email: 'ana@example.com' },
				productId: 'pdt_small',
				origin: 'https://vocal.quest'
			},
			impl
		);
		expect(r).toEqual({ ok: true, url: 'https://pay/x' });
		expect(calls[0].url).toBe('https://test.dodopayments.com/checkouts');
		expect(JSON.parse(String(calls[0].init?.body))).toEqual({
			product_cart: [{ product_id: 'pdt_small', quantity: 1 }],
			customer: { email: 'ana@example.com' },
			return_url: 'https://vocal.quest/?purchase=done',
			metadata: { user_id: 'u1' }
		});
	});

	it('en modo live usa la API de producción, y rechaza paquetes que no están a la venta', async () => {
		const { env } = setup();
		const { impl, calls } = fakeFetch(() => ({ body: { checkout_url: 'https://pay/y' } }));
		await createCheckout(
			{ ...env, DODO_MODE: 'live' },
			{ account: { id: 'u1', email: 'a@b.co' }, productId: 'pdt_big', origin: 'https://x' },
			impl
		);
		expect(calls[0].url).toBe('https://live.dodopayments.com/checkouts');
		expect(
			await createCheckout(
				env,
				{ account: { id: 'u1', email: 'a@b.co' }, productId: 'pdt_falso', origin: 'https://x' },
				impl
			)
		).toMatchObject({ ok: false, error: 'unknown_pack' });
	});
});

describe('avisos de pago y reembolso', () => {
	const paid = (extra: Record<string, unknown> = {}) =>
		fakeFetch((url) => {
			expect(url).toBe('https://test.dodopayments.com/payments/pay_1');
			return {
				body: {
					payment_id: 'pay_1',
					status: 'succeeded',
					metadata: { user_id: 'u1' },
					product_cart: [{ product_id: 'pdt_small', quantity: 1 }],
					customer: { email: 'ana@example.com' },
					...extra
				}
			};
		});
	const succeeded = { type: 'payment.succeeded', data: { payment_id: 'pay_1' } };

	it('un pago confirmado suma los créditos una sola vez aunque el aviso se repita', async () => {
		const { db, env } = setup();
		const { impl } = paid();
		expect(await handleWebhook(env, succeeded, impl)).toEqual({
			handled: true,
			credits: 250,
			duplicate: false
		});
		expect(await handleWebhook(env, succeeded, impl)).toEqual({
			handled: true,
			credits: 250,
			duplicate: true
		});
		expect(credits(db)).toBe(250);
	});

	it('se fía del pago que devuelve Dodo, no del aviso', async () => {
		const { db, env } = setup();
		const { impl } = paid({ status: 'processing' });
		expect(await handleWebhook(env, succeeded, impl)).toEqual({
			handled: false,
			reason: 'not_succeeded'
		});
		expect(credits(db)).toBe(0);
	});

	it('sin cuenta en la metadata, la busca por el email del pago', async () => {
		const { db, env } = setup();
		const { impl } = paid({ metadata: {}, customer: { email: 'ANA@example.com' } });
		expect(await handleWebhook(env, succeeded, impl)).toMatchObject({ handled: true });
		expect(credits(db)).toBe(250);
	});

	it('si Dodo falla al devolver el pago, lanza para que el aviso se reintente', async () => {
		const { env } = setup();
		const { impl } = fakeFetch(() => ({ status: 500, body: {} }));
		await expect(handleWebhook(env, succeeded, impl)).rejects.toThrow();
	});
});

describe('reembolsos y disputas', () => {
	const money = { total_amount: 1000, currency: 'USD' };
	/** El pago tal como lo devuelve Dodo, con lo que haga falta cambiado. */
	const api = (extra: Record<string, unknown> = {}) =>
		fakeFetch(() => ({
			body: {
				payment_id: 'pay_1',
				status: 'succeeded',
				metadata: { user_id: 'u1' },
				product_cart: [{ product_id: 'pdt_small', quantity: 1 }],
				refunds: [],
				disputes: [],
				...money,
				...extra
			}
		})).impl;
	const succeeded = { type: 'payment.succeeded', data: { payment_id: 'pay_1' } };
	const refundEvent = (id = 'ref_1') => ({
		type: 'refund.succeeded',
		data: { payment_id: 'pay_1', refund_id: id }
	});
	const disputeEvent = (type: string) => ({
		type: `dispute.${type}`,
		data: { payment_id: 'pay_1', dispute_id: 'dis_1' }
	});
	const refund = (amount: number, id = 'ref_1', extra: Record<string, unknown> = {}) => ({
		refund_id: id,
		status: 'succeeded',
		is_partial: true,
		amount,
		currency: 'USD',
		...extra
	});
	const full = { refund_status: 'full', refunds: [refund(1000, 'ref_1', { is_partial: false })] };
	const dispute = (status: string) => ({
		disputes: [{ dispute_id: 'dis_1', dispute_status: `dispute_${status}` }]
	});
	const setCredits = (db: ReturnType<typeof sqliteD1>, n: number) =>
		db.raw.prepare("UPDATE users SET credits = ? WHERE id = 'u1'").run(n);
	const ledger = (db: ReturnType<typeof sqliteD1>) =>
		db.raw.prepare('SELECT delta, reason FROM credit_ledger ORDER BY id').all();

	async function bought() {
		const s = setup();
		await handleWebhook(s.env, succeeded, api());
		return s;
	}

	it('un reembolso entero quita el paquete una sola vez', async () => {
		const { db, env } = await bought();
		expect(await handleWebhook(env, refundEvent(), api(full))).toEqual({
			handled: true,
			credits: -250
		});
		expect(await handleWebhook(env, refundEvent(), api(full))).toEqual({
			handled: true,
			duplicate: true
		});
		expect(credits(db)).toBe(0);
	});

	it('un reembolso parcial quita solo su parte, y varios se acumulan', async () => {
		const { db, env } = await bought();
		const one = { refund_status: 'partial', refunds: [refund(400)] };
		expect(await handleWebhook(env, refundEvent(), api(one))).toEqual({
			handled: true,
			credits: -100
		});
		const two = { refund_status: 'partial', refunds: [refund(400), refund(200, 'ref_2')] };
		await handleWebhook(env, refundEvent('ref_2'), api(two));
		expect(credits(db)).toBe(100);
		// un reembolso fallido o pendiente no cuenta
		const three = { refunds: [...two.refunds, refund(400, 'ref_3', { status: 'failed' })] };
		await handleWebhook(env, refundEvent('ref_2'), api(three));
		expect(credits(db)).toBe(100);
	});

	it('mide el reembolso en la moneda del pago o en la de liquidación', () => {
		const eur = { currency: 'EUR', total_amount: 900, settlement_currency: 'USD' };
		expect(refundedShare({ ...eur, refunds: [refund(450, 'r', { currency: 'EUR' })] })).toBe(0.5);
		expect(refundedShare({ ...eur, settlement_amount: 1000, refunds: [refund(250)] })).toBe(0.25);
		expect(refundedShare({ ...eur, refunds: [refund(450, 'r', { currency: 'JPY' })] })).toBeNull();
		expect(refundedShare({ ...money, refunds: [refund(9999)] })).toBe(1);
		expect(refundedShare(money)).toBe(0);
	});

	it('lo que ya se gastó no deja deuda ni se cobra de una compra posterior', async () => {
		const { db, env } = await bought();
		setCredits(db, 100);
		expect(await handleWebhook(env, refundEvent(), api(full))).toEqual({
			handled: true,
			credits: -100
		});
		expect(credits(db)).toBe(0);
		setCredits(db, 600);
		await handleWebhook(env, refundEvent(), api(full));
		expect(credits(db)).toBe(600);
	});

	it('una disputa quita los créditos al abrirse y no otra vez al perderse', async () => {
		const { db, env } = await bought();
		await handleWebhook(env, disputeEvent('opened'), api(dispute('opened')));
		expect(credits(db)).toBe(0);
		setCredits(db, 40);
		for (const s of ['challenged', 'expired', 'accepted', 'lost'])
			expect(await handleWebhook(env, disputeEvent(s), api(dispute(s)))).toEqual({
				handled: true,
				duplicate: true
			});
		expect(credits(db)).toBe(40);
		expect(ledger(db)).toEqual([
			{ delta: 250, reason: 'purchase' },
			{ delta: -250, reason: 'dispute' }
		]);
	});

	it.each(['won', 'cancelled'])(
		'si la disputa termina en %s vuelve justo lo quitado',
		async (end) => {
			const { db, env } = await bought();
			setCredits(db, 100); // ya gastó 150
			await handleWebhook(env, disputeEvent('opened'), api(dispute('opened')));
			expect(credits(db)).toBe(0);
			expect(await handleWebhook(env, disputeEvent(end), api(dispute(end)))).toEqual({
				handled: true,
				credits: 100
			});
			await handleWebhook(env, disputeEvent(end), api(dispute(end)));
			expect(credits(db)).toBe(100);
		}
	);

	it('un aviso viejo de «abierta» no vuelve a quitar los créditos de una disputa ganada', async () => {
		const { db, env } = await bought();
		await handleWebhook(env, disputeEvent('opened'), api(dispute('opened')));
		await handleWebhook(env, disputeEvent('won'), api(dispute('won')));
		await handleWebhook(env, disputeEvent('opened'), api(dispute('won')));
		expect(credits(db)).toBe(250);
	});

	it('disputa sobre un pago ya reembolsado en parte: al ganarse queda solo el reembolso', async () => {
		const { db, env } = await bought();
		const part = { refund_status: 'partial', refunds: [refund(400)] };
		await handleWebhook(env, refundEvent(), api(part));
		await handleWebhook(env, disputeEvent('opened'), api({ ...part, ...dispute('opened') }));
		expect(credits(db)).toBe(0);
		await handleWebhook(env, disputeEvent('won'), api({ ...part, ...dispute('won') }));
		expect(credits(db)).toBe(150);
	});

	it('si el reembolso llegó antes que el pago, la compra no deja créditos', async () => {
		const { db, env } = setup();
		expect(await handleWebhook(env, refundEvent(), api(full))).toEqual({
			handled: false,
			reason: 'unknown_payment'
		});
		await handleWebhook(env, succeeded, api(full));
		expect(credits(db)).toBe(0);
	});

	it('respeta un reembolso hecho con la versión anterior', async () => {
		const { db, env } = await bought();
		db.raw.exec(
			"INSERT INTO credit_ledger (user_id, delta, reason, ref, created_at) VALUES ('u1', -250, 'refund', 'refund:pay_1', 0)"
		);
		setCredits(db, 40);
		expect(await handleWebhook(env, refundEvent(), api(full))).toMatchObject({ duplicate: true });
		expect(credits(db)).toBe(40);
	});

	it('avisos simultáneos ajustan el saldo una sola vez', async () => {
		const { db, env } = await bought();
		setCredits(db, 600);
		await Promise.all(
			Array.from({ length: 5 }, () => handleWebhook(env, refundEvent(), api(full)))
		);
		expect(credits(db)).toBe(350);
		expect(ledger(db)).toHaveLength(2);
	});

	it('si el pago todavía no muestra el aviso, o el parcial no se puede medir, se reintenta', async () => {
		const { db, env } = await bought();
		await expect(handleWebhook(env, refundEvent(), api())).rejects.toThrow();
		await expect(handleWebhook(env, disputeEvent('opened'), api())).rejects.toThrow();
		const odd = { refunds: [refund(100, 'ref_1', { amount: null })] };
		await expect(handleWebhook(env, refundEvent(), api(odd))).rejects.toThrow();
		expect(credits(db)).toBe(250);
	});

	it('ignora los demás avisos sin consultar a Dodo', async () => {
		const { env } = setup();
		const { impl, calls } = fakeFetch(() => ({ body: {} }));
		expect(
			await handleWebhook(env, { type: 'refund.failed', data: { payment_id: 'pay_1' } }, impl)
		).toEqual({ handled: false, reason: 'ignored' });
		expect(calls).toHaveLength(0);
	});
});
