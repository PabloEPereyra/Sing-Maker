// POST /api/auth-verify — confirma el enlace del email ({ token }), abre la sesión (cookie HttpOnly) y da los
// créditos de regalo si a ese email todavía no se le dieron (ver src/lib/server/welcome.ts).
import { verifyLogin } from '../../src/lib/server/auth';
import type { FunctionEnv } from '../../src/lib/server/quota';
import { json } from '../../src/lib/server/respond';
import { grantWelcome, type WelcomeResult } from '../../src/lib/server/welcome';

export async function onRequestPost({
	request,
	env
}: {
	request: Request;
	env: FunctionEnv;
}): Promise<Response> {
	const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
	try {
		const r = await verifyLogin(request, env, { token: body?.token });
		if (!r.ok) return json({ error: r.error }, r.status);
		let welcome: WelcomeResult | 'error' = 'error';
		let credits = r.account.credits;
		if (env.DB)
			try {
				welcome = await grantWelcome(env.DB, env, request, r.account);
				if (welcome === 'granted') {
					const row = await env.DB.prepare('SELECT credits FROM users WHERE id = ?1')
						.bind(r.account.id)
						.first<{ credits: number }>();
					credits = row?.credits ?? credits;
				}
			} catch {
				// la sesión ya está abierta: el regalo se vuelve a intentar en el próximo inicio de sesión
			}
		return json({ account: { email: r.account.email, credits }, welcome }, 200, {
			'Set-Cookie': r.setCookie
		});
	} catch {
		return json({ error: 'auth_unavailable' }, 500);
	}
}
