// Generación de ejercicios con un modelo compatible con la API de OpenAI (chat/completions).
// El proveedor se elige por configuración: hoy OpenRouter (Nemotron, gratis) para probar; para el
// hackathon, la Meta Model API (Muse), cambiando solo LLM_BASE_URL / LLM_MODEL / LLM_API_KEY.
//
// Bucle de verificación: el modelo propone → zod + reglas musicales validan → si falla, se le
// devuelven los errores para que corrija (hasta MAX_ATTEMPTS). Medir y validar lo hace el código;
// componer lo hace el modelo.
import {
	applyNoteNames,
	dropNulls,
	extractJson,
	GENERATED_EXERCISE_JSON_SCHEMA,
	GeneratedExerciseSchema,
	toCode,
	validateGenerated,
	type GeneratedExercise,
	type VoiceRange
} from './exercise';
import { exampleMessages, NO_SCORE, scoreInstruction, systemPrompt } from './prompt';

export interface LlmConfig {
	baseUrl: string;
	model: string;
	/**
	 * Modelo para leer imágenes de partituras. En las pruebas Muse Wonder leyó la clave de fa mucho
	 * mejor que Spark; por defecto es el mismo `model`.
	 */
	visionModel: string;
	apiKey: string;
	/** Cómo pedir JSON: esquema estricto, objeto JSON libre o solo por instrucciones. */
	jsonMode: 'schema' | 'object' | 'none';
	/** Tope de tokens de la respuesta; los modelos que razonan gastan parte antes del JSON. */
	maxTokens: number;
	/**
	 * Esfuerzo de razonamiento; sin valor no se envía. OpenRouter usa `reasoning` ('none' lo apaga);
	 * Meta y OpenAI usan `reasoning_effort` (Muse acepta desde 'minimal').
	 */
	reasoningEffort?: 'none' | 'minimal' | 'low' | 'medium' | 'high';
}

export interface GenerateRequest {
	prompt: string;
	/** Foto o imagen de una partitura (data URL): se transcribe en vez de componer. */
	image?: string;
	/** Compás elegido (al componer): el resultado tiene que llenar compases enteros de ese compás. */
	meter?: '4/4' | '6/8';
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
	// Por defecto: Nemotron (OpenRouter) sin razonar, porque se queda sin tokens; Muse (Meta) con
	// razonamiento bajo, que en las pruebas dio buenos ejercicios en ~15–20 s.
	const effort =
		env.LLM_REASONING_EFFORT ??
		(baseUrl.includes('openrouter.ai')
			? 'none'
			: baseUrl.includes('meta.ai') || baseUrl.includes('meta.com')
				? 'low'
				: undefined);
	return {
		baseUrl,
		model: env.LLM_MODEL || DEFAULT_MODEL,
		visionModel: env.LLM_VISION_MODEL || env.LLM_MODEL || DEFAULT_MODEL,
		apiKey: env.LLM_API_KEY || '',
		jsonMode: jsonMode === 'object' || jsonMode === 'none' ? jsonMode : 'schema',
		maxTokens: Number(env.LLM_MAX_TOKENS) || 8000,
		reasoningEffort: ['none', 'minimal', 'low', 'medium', 'high'].includes(effort ?? '')
			? (effort as LlmConfig['reasoningEffort'])
			: undefined
	};
}

type ContentPart =
	{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
export type Message = { role: 'system' | 'user' | 'assistant'; content: string | ContentPart[] };

/** Esquema de la salida estructurada que se le pide al modelo. */
export interface ResponseFormat {
	name: string;
	schema: object;
}

export async function generateExercise(
	req: GenerateRequest,
	config: LlmConfig,
	fetchImpl: typeof fetch = fetch
): Promise<GenerateResult> {
	if (!config.apiKey) throw new GenerateError('Missing LLM_API_KEY on the server.', 500);
	const prompt = req.prompt.trim().slice(0, 1000);
	if (!prompt && !req.image) throw new GenerateError('Empty request.', 400);

	const messages: Message[] = [
		{
			role: 'system',
			content: systemPrompt(req.lang, req.range, req.image ? undefined : req.meter)
		},
		...exampleMessages(),
		{
			role: 'user',
			content: req.image
				? [
						{ type: 'text', text: scoreInstruction(prompt) },
						{ type: 'image_url', image_url: { url: req.image } }
					]
				: prompt
		}
	];

	const model = req.image ? config.visionModel : config.model;
	let lastErrors: string[] = [];
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		const content = await complete(messages, config, model, fetchImpl);
		let errors: string[];
		let exercise: GeneratedExercise | null = null;
		try {
			const parsed = GeneratedExerciseSchema.safeParse(dropNulls(extractJson(content)));
			if (parsed.success && req.image && parsed.data.name === NO_SCORE) {
				throw new GenerateError('No readable score was found in the image.', 422);
			}
			if (parsed.success) {
				// Partitura: los semitonos salen de los nombres de nota que leyó el modelo.
				exercise = req.image ? applyNoteNames(parsed.data) : parsed.data;
				errors = validateGenerated(exercise, req.range, req.image ? undefined : req.meter);
			} else {
				errors = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
			}
		} catch (e) {
			if (e instanceof GenerateError) throw e;
			errors = [`Invalid JSON: ${(e as Error).message}`];
		}
		if (exercise && errors.length === 0) {
			return { exercise, code: toCode(exercise), attempts: attempt, model };
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

export async function complete(
	messages: Message[],
	config: LlmConfig,
	model: string,
	fetchImpl: typeof fetch,
	format: ResponseFormat = { name: 'vocal_exercise', schema: GENERATED_EXERCISE_JSON_SCHEMA }
): Promise<string> {
	const body: Record<string, unknown> = {
		model,
		messages,
		temperature: 0.7,
		max_tokens: config.maxTokens
	};
	if (config.reasoningEffort) {
		if (config.baseUrl.includes('openrouter.ai'))
			body.reasoning =
				config.reasoningEffort === 'none' ? { enabled: false } : { effort: config.reasoningEffort };
		else body.reasoning_effort = config.reasoningEffort;
	}
	if (config.jsonMode === 'schema') {
		body.response_format = {
			type: 'json_schema',
			json_schema: { name: format.name, strict: true, schema: format.schema }
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
