// POST /api/auth-verify — confirma el enlace del email ({ token }) y abre la sesión (cookie HttpOnly).
import { verifyLogin } from '../../src/lib/server/auth';
import { CLIENT_HEADER, type FunctionEnv } from '../../src/lib/server/quota';
import { json } from '../../src/lib/server/respond';

export async function onRequestPost({
	request,
	env
}: {
	request: Request;
	env: FunctionEnv;
}): Promise<Response> {
	const body = (await request.json().catch(() => null)) as { token?: unknown } | null;
	try {
		const r = await verifyLogin(request, env, {
			token: body?.token,
			device: request.headers.get(CLIENT_HEADER)
		});
		if (!r.ok) return json({ error: r.error }, r.status);
		return json({ account: { email: r.account.email, credits: r.account.credits } }, 200, {
			'Set-Cookie': r.setCookie
		});
	} catch {
		return json({ error: 'auth_unavailable' }, 500);
	}
}
