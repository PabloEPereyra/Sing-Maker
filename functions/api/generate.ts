// POST /api/generate — Cloudflare Pages Function. Intermediario hacia el modelo: la clave vive en
// un secreto del servidor (LLM_API_KEY) y nunca llega al navegador. En desarrollo, vite.config.ts
// enruta la misma función y lee las variables de .dev.vars.
//
// Variables: LLM_API_KEY (obligatoria), LLM_BASE_URL, LLM_MODEL, LLM_JSON_MODE (schema|object|none).
import { z } from 'zod';
import { configFromEnv, generateExercise, GenerateError } from '../../src/lib/ai/generate';

const RequestSchema = z.object({
	prompt: z.string().min(1).max(1000),
	lang: z.enum(['es', 'en']).default('es'),
	range: z
		.object({ low: z.number().int().min(24).max(108), high: z.number().int().min(24).max(108) })
		.refine((r) => r.low < r.high)
		.optional()
});

type Env = Record<string, string | undefined>;

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
	try {
		const result = await generateExercise(input, configFromEnv(env));
		return json(result);
	} catch (e) {
		if (e instanceof GenerateError) {
			return json({ error: e.message, details: e.details }, e.status);
		}
		return json({ error: 'Unexpected error.' }, 500);
	}
}
