// Generación de ejercicios con un modelo compatible con la API de OpenAI (chat/completions).
// El proveedor se elige por configuración: hoy OpenRouter (Nemotron, gratis) para probar; para el
// hackathon, la Meta Model API (Muse), cambiando solo LLM_BASE_URL / LLM_MODEL / LLM_API_KEY.
//
// Bucle de verificación: el modelo propone → zod + reglas musicales validan → si falla, se le
// devuelven los errores para que corrija (hasta MAX_ATTEMPTS). Medir y validar lo hace el código;
// componer lo hace el modelo.
import {
	extractJson,
	GENERATED_EXERCISE_JSON_SCHEMA,
	GeneratedExerciseSchema,
	toCode,
	validateGenerated,
	type GeneratedExercise,
	type VoiceRange
} from './exercise';
import { exampleMessages, systemPrompt } from './prompt';

export interface LlmConfig {
	baseUrl: string;
	model: string;
	apiKey: string;
	/** Cómo pedir JSON: esquema estricto, objeto JSON libre o solo por instrucciones. */
	jsonMode: 'schema' | 'object' | 'none';
	/** Tope de tokens de la respuesta; los modelos que razonan gastan parte antes del JSON. */
	maxTokens: number;
	/** Razonamiento (parámetro `reasoning` de OpenRouter): 'none' lo apaga; sin valor no se envía. */
	reasoningEffort?: 'none' | 'low' | 'medium' | 'high';
}

export interface GenerateRequest {
	prompt: string;
	lang: 'es' | 'en';
	range?: VoiceRange;
}

export interface GenerateResult {
	exercise: GeneratedExercise;
	code: string;
	attempts: number;
	model: string;
}

export class GenerateError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly details: string[] = []
	) {
		super(message);
	}
}

const MAX_ATTEMPTS = 3;
const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_MODEL = 'nvidia/nemotron-3.5-super-vl:free';

export function configFromEnv(env: Record<string, string | undefined>): LlmConfig {
	const jsonMode = env.LLM_JSON_MODE;
	const baseUrl = (env.LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
	const effort =
		env.LLM_REASONING_EFFORT ?? (baseUrl.includes('openrouter.ai') ? 'none' : undefined);
	return {
		baseUrl,
		model: env.LLM_MODEL || DEFAULT_MODEL,
		apiKey: env.LLM_API_KEY || '',
		jsonMode: jsonMode === 'object' || jsonMode === 'none' ? jsonMode : 'schema',
		maxTokens: Number(env.LLM_MAX_TOKENS) || 8000,
		reasoningEffort: ['none', 'low', 'medium', 'high'].includes(effort ?? '')
			? (effort as LlmConfig['reasoningEffort'])
			: undefined
	};
}

type Message = { role: 'system' | 'user' | 'assistant'; content: string };

export async function generateExercise(
	req: GenerateRequest,
	config: LlmConfig,
	fetchImpl: typeof fetch = fetch
): Promise<GenerateResult> {
	if (!config.apiKey) throw new GenerateError('Missing LLM_API_KEY on the server.', 500);
	const prompt = req.prompt.trim().slice(0, 1000);
	if (!prompt) throw new GenerateError('Empty request.', 400);

	const messages: Message[] = [
		{ role: 'system', content: systemPrompt(req.lang, req.range) },
		...exampleMessages(),
		{ role: 'user', content: prompt }
	];

	let lastErrors: string[] = [];
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		const content = await complete(messages, config, fetchImpl);
		let errors: string[];
		let exercise: GeneratedExercise | null = null;
		try {
			const parsed = GeneratedExerciseSchema.safeParse(extractJson(content));
			if (parsed.success) {
				exercise = parsed.data;
				errors = validateGenerated(exercise, req.range);
			} else {
				errors = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
			}
		} catch (e) {
			errors = [`Invalid JSON: ${(e as Error).message}`];
		}
		if (exercise && errors.length === 0) {
			return { exercise, code: toCode(exercise), attempts: attempt, model: config.model };
		}
		lastErrors = errors;
		messages.push(
			{ role: 'assistant', content },
			{
				role: 'user',
				content: `The exercise is not valid:\n- ${errors.join('\n- ')}\nFix it and answer with the corrected JSON object only.`
			}
		);
	}
	throw new GenerateError('The model could not produce a valid exercise.', 422, lastErrors);
}

async function complete(
	messages: Message[],
	config: LlmConfig,
	fetchImpl: typeof fetch
): Promise<string> {
	const body: Record<string, unknown> = {
		model: config.model,
		messages,
		temperature: 0.7,
		max_tokens: config.maxTokens
	};
	if (config.reasoningEffort)
		body.reasoning =
			config.reasoningEffort === 'none' ? { enabled: false } : { effort: config.reasoningEffort };
	if (config.jsonMode === 'schema') {
		body.response_format = {
			type: 'json_schema',
			json_schema: { name: 'vocal_exercise', strict: true, schema: GENERATED_EXERCISE_JSON_SCHEMA }
		};
	} else if (config.jsonMode === 'object') {
		body.response_format = { type: 'json_object' };
	}
	const res = await fetchImpl(`${config.baseUrl}/chat/completions`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${config.apiKey}`,
			// Opcionales en OpenRouter (identifican la app); otros proveedores los ignoran.
			'HTTP-Referer': 'https://github.com/singmaker',
			'X-Title': 'Sing Maker'
		},
		body: JSON.stringify(body)
	});
	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new GenerateError(`Model API error ${res.status}`, 502, [text.slice(0, 500)]);
	}
	const data = (await res.json()) as {
		choices?: { finish_reason?: string; message?: { content?: string | null } }[];
		error?: { message?: string };
	};
	const choice = data.choices?.[0];
	const content = choice?.message?.content;
	if (!content)
		throw new GenerateError('Empty answer from the model.', 502, [
			`finish_reason: ${choice?.finish_reason ?? '-'}`,
			...(data.error?.message ? [data.error.message] : [])
		]);
	return content;
}
