// POST /api/checkout — crea la sesión de pago de un paquete de créditos ({ productId }) para la cuenta con la
// sesión iniciada y devuelve { url } (la página de pago de Dodo).
import { sessionAccount } from '../../src/lib/server/auth';
import { createCheckout } from '../../src/lib/server/payments';
import type { FunctionEnv } from '../../src/lib/server/quota';
import { json } from '../../src/lib/server/respond';

export async function onRequestPost({
	request,
	env
}: {
	request: Request;
	env: FunctionEnv & { APP_ORIGIN?: string };
}): Promise<Response> {
	const body = (await request.json().catch(() => null)) as { productId?: unknown } | null;
	try {
		const account = await sessionAccount(request, env);
		if (!account) return json({ error: 'login_required' }, 401);
		const r = await createCheckout(env, {
			account,
			productId: body?.productId,
			origin: env.APP_ORIGIN || new URL(request.url).origin
		});
		if (!r.ok) return json({ error: r.error }, r.status);
		return json({ url: r.url });
	} catch {
		return json({ error: 'checkout_failed' }, 500);
	}
}
