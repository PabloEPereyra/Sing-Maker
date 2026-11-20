// POST /api/auth-start — pide un enlace de inicio de sesión por email ({ email, lang }).
// En desarrollo (AUTH_DEV_LINKS=1, sin clave de Resend) devuelve el enlace en la respuesta.
import { startLogin } from '../../src/lib/server/auth';
import type { FunctionEnv } from '../../src/lib/server/quota';
import { json } from '../../src/lib/server/respond';

export async function onRequestPost({
	request,
	env
}: {
	request: Request;
	env: FunctionEnv & { APP_ORIGIN?: string };
}): Promise<Response> {
	const body = (await request.json().catch(() => null)) as {
		email?: unknown;
		lang?: unknown;
	} | null;
	try {
		const r = await startLogin(env, {
			email: body?.email,
			lang: body?.lang === 'en' ? 'en' : 'es',
			origin: env.APP_ORIGIN || new URL(request.url).origin
		});
		if (!r.ok) return json({ error: r.error }, r.status);
		return json({ sent: true, ...(r.devLink ? { devLink: r.devLink } : {}) });
	} catch {
		return json({ error: 'auth_unavailable' }, 500);
	}
}
