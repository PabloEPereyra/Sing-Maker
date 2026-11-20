// POST /api/auth-logout — cierra la sesión y borra la cookie.
import { logout } from '../../src/lib/server/auth';
import type { FunctionEnv } from '../../src/lib/server/quota';
import { json } from '../../src/lib/server/respond';

export async function onRequestPost({
	request,
	env
}: {
	request: Request;
	env: FunctionEnv;
}): Promise<Response> {
	try {
		return json({ ok: true }, 200, { 'Set-Cookie': await logout(request, env) });
	} catch {
		return json({ error: 'auth_unavailable' }, 500);
	}
}
