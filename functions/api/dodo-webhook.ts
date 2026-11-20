// POST /api/dodo-webhook — avisos de Dodo Payments (pago confirmado, reembolso). Se verifica la firma con el
// cuerpo crudo antes de leerlo. Responde 2xx cuando el aviso quedó procesado (o no hace falta procesarlo);
// un 500 hace que Dodo lo reintente más tarde.
import { handleWebhook, verifyWebhook } from '../../src/lib/server/payments';
import type { FunctionEnv } from '../../src/lib/server/quota';
import { json } from '../../src/lib/server/respond';

export async function onRequestPost({
	request,
	env
}: {
	request: Request;
	env: FunctionEnv;
}): Promise<Response> {
	if (!env.DODO_WEBHOOK_SECRET) return json({ error: 'payments_unavailable' }, 503);
	const raw = await request.text();
	if (!(await verifyWebhook(env.DODO_WEBHOOK_SECRET, request.headers, raw)))
		return json({ error: 'invalid_signature' }, 401);
	let event;
	try {
		event = JSON.parse(raw);
	} catch {
		return json({ error: 'invalid_body' }, 400);
	}
	try {
		const result = await handleWebhook(env, event);
		if (!result.handled) console.warn('dodo-webhook sin procesar:', event?.type, result.reason);
		return json({ received: true });
	} catch (e) {
		console.error('dodo-webhook falló:', (e as Error).message);
		return json({ error: 'retry' }, 500);
	}
}
