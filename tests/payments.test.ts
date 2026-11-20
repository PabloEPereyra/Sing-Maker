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

	it('un reembolso descuenta los créditos de esa compra, sin bajar de 0 ni repetir', async () => {
		const { db, env } = setup();
		await handleWebhook(env, succeeded, paid().impl);
		db.raw.prepare("UPDATE users SET credits = 100 WHERE id = 'u1'").run(); // ya gastó 150
		const refund = { type: 'refund.succeeded', data: { payment_id: 'pay_1' } };
		expect(await handleWebhook(env, refund)).toEqual({ handled: true, credits: -250 });
		expect(credits(db)).toBe(0);
		expect(await handleWebhook(env, refund)).toEqual({ handled: true, duplicate: true });
	});

	it('si Dodo falla al devolver el pago, lanza para que el aviso se reintente', async () => {
		const { env } = setup();
		const { impl } = fakeFetch(() => ({ status: 500, body: {} }));
		await expect(handleWebhook(env, succeeded, impl)).rejects.toThrow();
	});
});
