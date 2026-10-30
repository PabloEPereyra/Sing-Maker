// POST /api/generate — Cloudflare Pages Function. Intermediario hacia el modelo: la clave vive en
// un secreto del servidor (LLM_API_KEY) y nunca llega al navegador. En desarrollo, vite.config.ts
// enruta la misma función y lee las variables de .dev.vars.
//
// Variables: LLM_API_KEY (obligatoria), LLM_BASE_URL, LLM_MODEL, LLM_JSON_MODE (schema|object|none).
import { z } from 'zod';
import { configFromEnv, generateExercise, GenerateError } from '../../src/lib/ai/generate';
import { charge, refund, type FunctionEnv } from '../../src/lib/server/quota';

/** Imagen de partitura como data URL (PNG, JPEG o WebP), hasta ~5 MB. */
const ImageSchema = z
	.string()
	.max(7_000_000)
	.regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/);

const RequestSchema = z
	.object({
		prompt: z.string().max(1000).default(''),
		image: ImageSchema.optional(),
		meter: z.enum(['4/4', '6/8']).optional(),
		lang: z.enum(['es', 'en']).default('es'),
		range: z
			.object({ low: z.number().int().min(24).max(108), high: z.number().int().min(24).max(108) })
			.refine((r) => r.low < r.high)
			.optional()
	})
	.refine((r) => r.prompt.trim() || r.image, 'Empty request.');

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
		const result = await generateExercise(input, configFromEnv(env));
		return json(result);
	} catch (e) {
		if (e instanceof GenerateError && e.status < 500) {
			return json({ error: e.message, details: e.details }, e.status);
		}
		await refund(env, gate.user, 'exercises');
		if (e instanceof GenerateError) return json({ error: e.message, details: e.details }, e.status);
		return json({ error: 'Unexpected error.' }, 500);
	}
}
