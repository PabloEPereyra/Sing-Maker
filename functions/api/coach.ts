// POST /api/coach — Cloudflare Pages Function. Devolución de un entrenador vocal con IA al terminar un
// ejercicio. La clave vive en el servidor, igual que en /api/generate.
import { coachFeedback, CoachRequestSchema } from '../../src/lib/ai/coach';
import { configFromEnv, GenerateError } from '../../src/lib/ai/generate';
import { charge, refund, type FunctionEnv } from '../../src/lib/server/quota';

type Env = FunctionEnv;

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
	});
}

export async function onRequestPost({
	request,
	env
}: {
	request: Request;
	env: Env;
}): Promise<Response> {
	const parsed = CoachRequestSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ error: 'Invalid request.' }, 400);
	const gate = await charge(request, env, 'other');
	if (!gate.ok) return json({ error: gate.error, bucket: gate.bucket }, gate.status);
	try {
		return json(await coachFeedback(parsed.data, configFromEnv(env)));
	} catch (e) {
		if (e instanceof GenerateError && e.status < 500)
			return json({ error: e.message, details: e.details }, e.status);
		await refund(env, gate.user, 'other');
		if (e instanceof GenerateError) return json({ error: e.message, details: e.details }, e.status);
		return json({ error: 'Unexpected error.' }, 500);
	}
}
