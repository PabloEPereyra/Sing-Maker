// POST /api/drums — Cloudflare Pages Function. Le pide al modelo un patrón de batería (grilla de pasos
// por instrumento) para un compás. La clave vive en el servidor, igual que en /api/generate.
import { z } from 'zod';
import { generateDrumPattern } from '../../src/lib/ai/drums';
import { configFromEnv, GenerateError } from '../../src/lib/ai/generate';
import { charge, refund, type FunctionEnv } from '../../src/lib/server/quota';

const RequestSchema = z.object({
	prompt: z.string().min(1).max(500),
	meter: z.enum(['4/4', '6/8']),
	lang: z.enum(['es', 'en']).default('es')
});

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
	let input: z.infer<typeof RequestSchema>;
	try {
		input = RequestSchema.parse(await request.json());
	} catch {
		return json({ error: 'Invalid request.' }, 400);
	}
	const gate = await charge(request, env, 'exercises');
	if (!gate.ok) return json({ error: gate.error, bucket: gate.bucket }, gate.status);
	try {
		return json(await generateDrumPattern(input, configFromEnv(env)));
	} catch (e) {
		if (e instanceof GenerateError && e.status < 500)
			return json({ error: e.message, details: e.details }, e.status);
		await refund(env, gate.user, 'exercises');
		if (e instanceof GenerateError) return json({ error: e.message, details: e.details }, e.status);
		return json({ error: 'Unexpected error.' }, 500);
	}
}
