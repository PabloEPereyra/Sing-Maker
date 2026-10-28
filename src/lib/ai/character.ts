// Creador de personajes con IA (Meta Model API). Reparto de modelos, del más barato al más caro:
//   Muse Spark 1.3 (LLM_MODEL): interpreta el pedido y, si hay foto, lista qué personajes/objetos contiene.
//   SAM 3.1: recorta (un objeto de una foto; y cada pose de una tira, con borde limpio).
//   Muse Image: dibuja el personaje y sus tiras de poses (a partir de texto o de una imagen de referencia).
// Muse Wonder no se usa: Spark lee bien las fotos para esto.
// El servidor solo reenvía y valida; el procesado de imágenes (cortar, alinear, armar las tiras) es del navegador.
import { z } from 'zod';
import { complete, GenerateError, type LlmConfig, type Message } from './generate';

import { STRIPS, STYLES, type Movement, type StripKind, type StyleId } from '../character/spec';
export { STRIPS, STYLES };
export type { Movement, StripKind, StyleId };

const STYLE_PROMPT: Record<StyleId, string> = {
	cute3d: 'cute soft 3D cartoon render, big expressive eyes, soft lighting, clean and friendly',
	cartoon: 'flat 2D cartoon illustration, bold clean outlines, bright colors',
	pixel: 'chunky pixel art sprite, limited palette, crisp pixels',
	watercolor: 'soft watercolor storybook illustration, gentle colors'
};

/** Verde de fondo que se le pide a Muse Image para poder separar al personaje. */
export const BACKDROP = 'flat solid chroma-key green (#00B140)';

const dataUrl = z
	.string()
	.max(8_000_000)
	.regex(/^data:image\/(png|jpeg|webp);base64,/);

export const CharacterRequestSchema = z.discriminatedUnion('action', [
	z.object({
		action: z.literal('brief'),
		prompt: z.string().max(600).default(''),
		image: dataUrl.optional(),
		lang: z.enum(['es', 'en']).default('es')
	}),
	z.object({
		action: z.literal('objects'),
		image: dataUrl,
		lang: z.enum(['es', 'en']).default('es')
	}),
	z.object({
		action: z.literal('hero'),
		visual: z.string().min(3).max(600),
		style: z.enum(STYLES).default('cute3d'),
		movement: z.enum(['walk', 'fly']),
		flight: z.string().max(300).optional()
	}),
	z.object({
		action: z.literal('strip'),
		kind: z.enum(['move', 'jump', 'stand']),
		visual: z.string().min(3).max(600),
		style: z.enum(STYLES).default('cute3d'),
		movement: z.enum(['walk', 'fly']),
		flight: z.string().max(300).optional(),
		reference: dataUrl
	}),
	z.object({ action: z.literal('segment'), image: dataUrl, noun: z.string().min(1).max(80) })
]);
export type CharacterRequest = z.infer<typeof CharacterRequestSchema>;

// ---------- Spark: interpretar el pedido ----------

export const BRIEF_JSON_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['status', 'message', 'name', 'noun', 'visual', 'flight'],
	properties: {
		status: { type: 'string', enum: ['ok', 'clarify', 'refuse'] },
		message: { type: 'string' },
		name: { type: 'string' },
		noun: { type: 'string' },
		visual: { type: 'string' },
		flight: { type: 'string' }
	}
};

const BriefSchema = z.object({
	status: z.enum(['ok', 'clarify', 'refuse']),
	message: z.string(),
	name: z.string(),
	noun: z.string(),
	visual: z.string(),
	flight: z.string()
});
export type Brief = z.infer<typeof BriefSchema>;

function briefSystem(lang: 'es' | 'en'): string {
	const language = lang === 'es' ? 'Spanish' : 'English';
	return `You turn a request into a brief for a game character. The character is the hero of a kids-friendly vocal-training game: it runs, jumps or flies over a scenery.
Answer with JSON only:
- status: "ok" when you can picture ONE specific character; "clarify" when the request is too vague or has several unrelated subjects (e.g. "something nice", "a thing"); "refuse" for real people, famous copyrighted characters, brands, violence, sexual or hateful content.
- message: for "clarify" ask ONE short question in ${language} with 2-3 concrete suggestions; for "refuse" a short polite reason in ${language}; for "ok" an empty string.
- name: a short friendly name in ${language} (max 3 words), empty if not ok.
- noun: the subject as a short ENGLISH noun phrase for an object-segmentation model: the kind of creature or object plus at most one color, WITHOUT the clothes or accessories it wears (e.g. "white rabbit", "cat", "orange fox"; NOT "cat with blue cap"). Name the WHOLE visible object: when the character pilots or rides a vehicle, use the vehicle (e.g. "helicopter", "rocket", "bicycle"), not the creature inside. Empty if not ok.
- visual: ENGLISH visual description of the single character for an image generator: species/kind, body shape, colors, distinctive accessories, expression. Describe only the character (no background, no action, no style words) and only what the request says: do NOT add wings, capes, jetpacks or other gear that the request does not mention. Max 60 words. Empty if not ok.
- flight: ENGLISH, one sentence on HOW this character flies, taken from the request: its own gear, vehicle or power (cape, jetpack, helicopter rotor, balloon, rocket boots, magic carpet, superhero pose...). Use wings ONLY if the request mentions wings or the creature naturally flies (bird, bee, bat, butterfly, dragon, fairy). For anything else (a sheep, a cat, a robot...) invent a fun fitting way WITHOUT wings, e.g. "flying like a superhero, body stretched forward, cape rippling in the wind". Empty if not ok.
When a photo is attached, describe THAT subject (if it has several, pick the most prominent). Keep the identity faithful to the request.`;
}

export async function makeBrief(
	req: { prompt: string; image?: string; lang: 'es' | 'en' },
	config: LlmConfig,
	fetchImpl: typeof fetch = fetch
): Promise<Brief> {
	if (!req.prompt.trim() && !req.image) throw new GenerateError('Empty request.', 400);
	const text = req.prompt.trim() || 'Use the subject of the photo.';
	const messages: Message[] = [
		{ role: 'system', content: briefSystem(req.lang) },
		{
			role: 'user',
			content: req.image
				? [
						{ type: 'text', text },
						{ type: 'image_url', image_url: { url: req.image } }
					]
				: text
		}
	];
	return askJson(messages, config, fetchImpl, BriefSchema, BRIEF_JSON_SCHEMA, 'character_brief');
}

// ---------- Spark: qué hay en la foto ----------

export const OBJECTS_JSON_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['objects'],
	properties: {
		objects: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				required: ['noun', 'label'],
				properties: { noun: { type: 'string' }, label: { type: 'string' } }
			}
		}
	}
};
const ObjectsSchema = z.object({
	objects: z.array(z.object({ noun: z.string(), label: z.string() }))
});

export async function listObjects(
	req: { image: string; lang: 'es' | 'en' },
	config: LlmConfig,
	fetchImpl: typeof fetch = fetch
): Promise<{ noun: string; label: string }[]> {
	const language = req.lang === 'es' ? 'Spanish' : 'English';
	const messages: Message[] = [
		{
			role: 'user',
			content: [
				{
					type: 'text',
					text: `List the distinct characters, animals, people or objects in this image that could be cut out and used in a game (at most 8, most prominent first). "noun" = a short ENGLISH noun phrase an object-segmentation model understands, specific enough to tell similar things apart (e.g. "orange cat", "red ball"). "label" = a short name in ${language}. Do not list background elements (sky, ground, walls). Empty list if nothing fits.`
				},
				{ type: 'image_url', image_url: { url: req.image } }
			]
		}
	];
	const out = await askJson(
		messages,
		config,
		fetchImpl,
		ObjectsSchema,
		OBJECTS_JSON_SCHEMA,
		'photo_objects'
	);
	return out.objects.slice(0, 8);
}

/** Pide JSON a Spark (con el esquema estricto) y lo valida; si no sirve, un reintento. */
async function askJson<T>(
	messages: Message[],
	config: LlmConfig,
	fetchImpl: typeof fetch,
	schema: z.ZodType<T>,
	jsonSchema: object,
	name: string
): Promise<T> {
	if (!config.apiKey) throw new GenerateError('Missing LLM_API_KEY on the server.', 500);
	let lastError = '';
	for (let attempt = 0; attempt < 2; attempt++) {
		const content = await complete(messages, config, config.model, fetchImpl, {
			name,
			schema: jsonSchema
		});
		try {
			const parsed = schema.safeParse(JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, '')));
			if (parsed.success) return parsed.data;
			lastError = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
		} catch (e) {
			lastError = (e as Error).message;
		}
		messages = [
			...messages,
			{ role: 'assistant', content },
			{ role: 'user', content: `Invalid answer (${lastError}). Reply with the JSON object only.` }
		];
	}
	throw new GenerateError('The model could not answer in the expected format.', 422, [lastError]);
}

// ---------- Muse Image: personaje y tiras de poses ----------

export interface MediaConfig {
	baseUrl: string;
	apiKey: string;
	imageModel: string;
	segmentModel: string;
}

export function mediaConfigFromEnv(
	env: Record<string, string | undefined>,
	config: LlmConfig
): MediaConfig {
	return {
		baseUrl: config.baseUrl,
		apiKey: config.apiKey,
		imageModel: env.LLM_IMAGE_MODEL || 'muse-image-1.0',
		segmentModel: env.LLM_SEGMENT_MODEL || 'sam-3.1'
	};
}

const POSES = (flight?: string): Record<Movement, Record<StripKind, string>> => ({
	walk: {
		move: 'a looping RUN CYCLE (contact, down, passing, up poses; the last frame flows back into the first), running to the right',
		jump: 'a JUMP sequence in order: crouched anticipation, pushing off, rising with body stretched, apex, falling with legs reaching down to land',
		stand:
			'TWO poses: (1) standing relaxed in side view facing right; (2) standing facing the viewer, front view, one hand waving hello'
	},
	fly: {
		move: flight?.trim()
			? `a looping FLIGHT cycle, flying to the right: ${flight.trim()}. Every pose shows a slightly different phase of that motion (for example a cape rippling, rotor blades at different angles, flames flickering, limbs moving) so the loop animates smoothly and the last pose flows back into the first. Do NOT add wings unless the character already has wings in the reference image`
			: 'a looping FLAPPING FLIGHT cycle (wings up, mid, down, mid; the last frame flows back into the first), flying to the right',
		jump: '',
		stand:
			'TWO poses: (1) standing in side view facing right, relaxed, keeping all its accessories and gear; (2) standing facing the viewer, front view, friendly greeting'
	}
});

export function heroPrompt(visual: string, style: StyleId): string {
	return `Character design of ${visual}. ${STYLE_PROMPT[style]}. Full body, a single character centered, side view facing right, whole body fully visible and not cropped, on a ${BACKDROP} background with no shadows, no ground, no text.`;
}

export function stripPrompt(
	kind: StripKind,
	visual: string,
	style: StyleId,
	movement: Movement,
	flight?: string
): string {
	const n = STRIPS[kind].ask;
	return `Sprite sheet of the SAME character as the reference image (${visual}), exactly ${n} separate poses in ONE single horizontal row, evenly spaced with clear empty space between poses, same size and same art style in every pose, none overlapping or touching: ${POSES(flight)[movement][kind]}. ${STYLE_PROMPT[style]}. Each pose shows the whole body fully visible and not cropped. ${BACKDROP} background everywhere, no shadows, no ground line, no text, no numbers, no borders.`;
}

interface ImageResponse {
	data?: { b64_json?: string }[];
	output_format?: string;
}

/** Genera una imagen (opcionalmente editando una de referencia). Devuelve una data URL. */
export async function generateImage(
	prompt: string,
	media: MediaConfig,
	opts: { size: string; reference?: string },
	fetchImpl: typeof fetch = fetch
): Promise<string> {
	if (!media.apiKey) throw new GenerateError('Missing LLM_API_KEY on the server.', 500);
	const body: Record<string, unknown> = { model: media.imageModel, prompt, n: 1, size: opts.size };
	if (opts.reference) body.images = [{ image_url: opts.reference }];
	const res = await fetchImpl(
		`${media.baseUrl}/images/${opts.reference ? 'edits' : 'generations'}`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${media.apiKey}` },
			body: JSON.stringify(body)
		}
	);
	const text = await res.text();
	if (!res.ok) throw upstreamError(res.status, text);
	let data: ImageResponse;
	try {
		data = JSON.parse(text) as ImageResponse;
	} catch {
		throw new GenerateError('The image model returned an unreadable answer.', 502);
	}
	const b64 = data.data?.[0]?.b64_json;
	if (!b64) throw new GenerateError('The image model did not return an image.', 502);
	return `data:image/${data.output_format || 'webp'};base64,${b64}`;
}

// ---------- SAM 3.1 ----------

/** Texto crudo de SAM (cajas + máscaras); se decodifica en el navegador (ver src/lib/character/sam.ts). */
export async function segmentImage(
	image: string,
	noun: string,
	media: MediaConfig,
	fetchImpl: typeof fetch = fetch
): Promise<string> {
	if (!media.apiKey) throw new GenerateError('Missing LLM_API_KEY on the server.', 500);
	const res = await fetchImpl(`${media.baseUrl}/responses`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${media.apiKey}` },
		body: JSON.stringify({
			model: media.segmentModel,
			metadata: { mask_encoding: 'one_bit' },
			input: [
				{
					role: 'user',
					content: [
						{ type: 'input_text', text: noun },
						{ type: 'input_image', image_url: image }
					]
				}
			]
		})
	});
	const text = await res.text();
	if (!res.ok) throw upstreamError(res.status, text);
	try {
		const data = JSON.parse(text) as {
			output?: { content?: { text?: string }[] }[];
		};
		return data.output?.[0]?.content?.[0]?.text ?? '';
	} catch {
		throw new GenerateError('The segmentation model returned an unreadable answer.', 502);
	}
}

function upstreamError(status: number, body: string): GenerateError {
	let message = '';
	try {
		message = (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? '';
	} catch {
		message = body.slice(0, 200);
	}
	if (status === 429) return new GenerateError('Too many requests: try again in a minute.', 429);
	if (/safety|policy|moderat|blocked|not allowed/i.test(message))
		return new GenerateError('The image was blocked by the content policy.', 422, [message]);
	return new GenerateError(`The model service failed (${status}).`, 502, message ? [message] : []);
}

/** Tamaño pedido para cada imagen: tiras anchas (4:1) y el personaje solo cuadrado. */
export const SIZE = { strip: '2000x500', hero: '1024x1024' } as const;
