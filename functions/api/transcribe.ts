// POST /api/transcribe — Cloudflare Pages Function. Dictado: recibe un WAV corto (base64) y lo pasa a
// texto con Muse Voice Transcribe. La clave vive en el servidor, igual que en /api/generate.
//
// Variables: LLM_API_KEY, LLM_BASE_URL (Meta), LLM_TRANSCRIBE_MODEL (por defecto muse-voice-transcribe-1.0).
import { z } from 'zod';
import { transcribeConfigFromEnv, transcribeSpeech } from '../../src/lib/ai/dictation';
import { GenerateError } from '../../src/lib/ai/generate';

/** WAV en base64, hasta ~1 minuto de voz a 16 kHz. */
const RequestSchema = z.object({
	audio: z
		.string()
		.max(3_000_000)
		.regex(/^[A-Za-z0-9+/=]+$/),
	lang: z.enum(['es', 'en']).default('es')
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
		const wav = Uint8Array.from(atob(input.audio), (c) => c.charCodeAt(0));
		const text = await transcribeSpeech(wav, input.lang, transcribeConfigFromEnv(env));
		return json({ text });
	} catch (e) {
		if (e instanceof GenerateError) return json({ error: e.message, details: e.details }, e.status);
		return json({ error: 'Unexpected error.' }, 500);
	}
}
