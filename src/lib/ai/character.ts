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
	anime:
		'anime style cel-shaded illustration, clean line art, large expressive eyes, vibrant colors, crisp highlights',
	ligneclaire:
		'ligne claire comic style: clean dark outlines of one uniform thickness, flat solid colors with no gradients and no shading, clear readable shapes',
	comic:
		'retro comic-book style: bold black ink outlines, flat saturated colors, halftone dot shading',
	clay: 'claymation plasticine style, soft handmade clay textures, rounded forms, soft studio lighting',
	flatvector:
		'flat vector illustration, minimal geometric shapes, solid colors, no gradients, no outlines',
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
		/** Qué se crea: un personaje, un objeto para recoger o un fondo. */
		kind: z.enum(['character', 'item', 'scene']).default('character'),
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
		flight: z.string().max(300).optional(),
		/** Retoque: se edita esta imagen (el personaje actual) aplicando `change`, en vez de dibujar uno nuevo. */
		reference: dataUrl.optional(),
		asset: z.enum(['character', 'item']).default('character'),
		change: z.string().max(300).optional(),
		/** El estilo de dibujo cambió: se redibuja el mismo personaje en el estilo nuevo. */
		restyle: z.boolean().optional()
	}),
	z.object({
		action: z.literal('refine'),
		visual: z.string().min(3).max(600),
		noun: z.string().min(1).max(80),
		flight: z.string().max(300).default(''),
		instruction: z.string().min(2).max(300),
		lang: z.enum(['es', 'en']).default('es')
	}),
	z.object({
		action: z.literal('strip'),
		kind: z.enum(['move', 'jump', 'stand', 'item']),
		visual: z.string().min(3).max(600),
		style: z.enum(STYLES).default('cute3d'),
		movement: z.enum(['walk', 'fly']),
		flight: z.string().max(300).optional(),
		reference: dataUrl
	}),
	z.object({ action: z.literal('segment'), image: dataUrl, noun: z.string().min(1).max(80) }),
	z.object({ action: z.literal('facing'), image: dataUrl }),
	z.object({
		action: z.literal('scene'),
		visual: z.string().min(3).max(600),
		style: z.enum(STYLES).default('cute3d'),
		movement: z.enum(['walk', 'fly'])
	}),
	z.object({ action: z.literal('ground'), image: dataUrl })
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

function briefSystem(
	lang: 'es' | 'en',
	kind: 'character' | 'item' | 'scene' = 'character'
): string {
	const language = lang === 'es' ? 'Spanish' : 'English';
	const common = `Answer with JSON only:
- status: "ok" when you can picture it clearly; "clarify" when the request is too vague or contradictory; "refuse" for real people, famous copyrighted characters, brands, violence, sexual or hateful content.
- message: for "clarify" ask ONE short question in ${language} with 2-3 concrete suggestions; for "refuse" a short polite reason in ${language}; for "ok" an empty string.
- name: ${
		kind === 'character'
			? `a short friendly name in ${language} (max 3 words)`
			: `a short DESCRIPTIVE title in ${language} (2 to 4 words) that names what is actually depicted and one distinctive detail (e.g. a place and its time of day, or the object and its material). Never use mood or praise adjectives such as happy, cheerful, joyful, colorful, magical, beautiful or their translations (alegre, feliz, colorido, mágico, bonito), and vary the wording from one request to the next`
	}, empty if not ok.`;
	if (kind === 'item')
		return `You turn a request into a brief for a collectible item of a kids-friendly vocal-training game: the small object the player collects while singing (a star, a carrot, a coin, a music note, a fruit, a gem...).
${common}
- noun: the object as a short ENGLISH noun phrase for an object-segmentation model (e.g. "golden coin", "red apple"); empty if not ok.
- visual: ENGLISH visual description of the single object for an image generator: shape, colors, distinctive details. Only the object (no background, no hands, no style words). Max 40 words. Empty if not ok.
- flight: always an empty string.
When a photo is attached, describe THAT object (if it has several, the most prominent).`;
	if (kind === 'scene')
		return `You turn a request into a brief for the background scenery of a kids-friendly side-scrolling vocal-training game.
${common}
- noun: always an empty string.
- visual: ENGLISH description of the scenery for an image generator: setting, time of day, colors, mood, a few landmarks. No characters, no text. Max 50 words. Empty if not ok.
- flight: always an empty string.`;
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
	req: {
		prompt: string;
		image?: string;
		lang: 'es' | 'en';
		kind?: 'character' | 'item' | 'scene';
	},
	config: LlmConfig,
	fetchImpl: typeof fetch = fetch
): Promise<Brief> {
	if (!req.prompt.trim() && !req.image) throw new GenerateError('Empty request.', 400);
	const text = req.prompt.trim() || 'Use the subject of the photo.';
	const messages: Message[] = [
		{ role: 'system', content: briefSystem(req.lang, req.kind) },
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
export async function askJson<T>(
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

const ITEM_POSES =
	'TWO poses of the SAME small item, each upright and centered in its own cell: (1) normal; (2) tilted about 15 degrees to one side. No glow, no sparkles, no halo, nothing around the item';

const POSES = (flight?: string): Record<Movement, Record<StripKind, string>> => ({
	walk: {
		move: 'a looping RUN CYCLE (contact, down, passing, up poses; the last frame flows back into the first), running to the right',
		jump: 'a JUMP sequence of 6 poses in order: crouched anticipation, pushing off the ground, rising with body stretched, apex of the jump, falling with legs reaching down, landing and absorbing the impact',
		stand:
			'TWO poses: (1) standing relaxed in side view facing right; (2) standing facing the viewer, front view, one hand waving hello',
		item: ITEM_POSES
	},
	fly: {
		move: flight?.trim()
			? `a looping FLIGHT cycle, flying to the right: ${flight.trim()}. Every pose shows a slightly different phase of that motion (for example a cape rippling, rotor blades at different angles, flames flickering, limbs moving) so the loop animates smoothly and the last pose flows back into the first. Do NOT add wings unless the character already has wings in the reference image`
			: 'a looping FLAPPING FLIGHT cycle (wings up, mid, down, mid; the last frame flows back into the first), flying to the right',
		jump: '',
		stand:
			'TWO poses: (1) standing in side view facing right, relaxed, keeping all its accessories and gear; (2) standing facing the viewer, front view, friendly greeting',
		item: ITEM_POSES
	}
});

/** Retoque de la imagen del personaje: se cambia solo lo pedido y todo lo demás queda igual. */
export function heroEditPrompt(
	visual: string,
	style: StyleId,
	change: string,
	restyle = false
): string {
	if (restyle)
		return `Redraw the character of the reference image (${visual}) in this art style: ${STYLE_PROMPT[style]}. Keep the same identity, colors, accessories, side view facing RIGHT, framing and ${BACKDROP} background.${change ? ` Also apply this change: ${change}.` : ''} Whole body fully visible and not cropped, no shadows, no ground, no text.`;
	return `Edit the reference image: keep EXACTLY the same character (${visual}), the same art style (${STYLE_PROMPT[style]}), the same side view facing RIGHT, the same framing and the same ${BACKDROP} background; change ONLY this: ${change}. Whole body fully visible and not cropped, no shadows, no ground, no text.`;
}

export function heroPrompt(
	visual: string,
	style: StyleId,
	asset: 'character' | 'item' = 'character'
): string {
	if (asset === 'item')
		return `Game collectible icon of ${visual}. ${STYLE_PROMPT[style]}. A single object centered, the whole object visible and not cropped, on a ${BACKDROP} background with no shadows, no ground, no hands, no text.`;
	return `Character design of ${visual}. ${STYLE_PROMPT[style]}. Full body, a single character centered, side view facing RIGHT (the front of the character or vehicle points toward the right edge), whole body fully visible and not cropped, on a ${BACKDROP} background with no shadows, no ground, no text.`;
}

export function stripPrompt(
	kind: StripKind,
	visual: string,
	style: StyleId,
	movement: Movement,
	flight?: string
): string {
	const { cols, rows, ask } = STRIPS[kind];
	if (kind === 'item')
		return `Sprite sheet of the SAME item as the reference image (${visual}), laid out as ONE row of ${cols} equal cells, exactly one pose per cell, left to right. Each pose sits fully inside its own cell, centered, with generous empty space on all sides: nothing may touch or cross the edges of its cell or touch another pose. Same size and same art style in every pose. ${ITEM_POSES}. ${STYLE_PROMPT[style]}. The whole object is visible and not cropped. ${BACKDROP} background everywhere, no grid lines, no borders, no shadows, no text, no numbers.`;
	const layout =
		rows === 1
			? `ONE row of ${cols} equal cells`
			: `a grid of ${cols} columns by ${rows} rows (${ask} equal cells)`;
	return `Sprite sheet of the SAME character as the reference image (${visual}), laid out as ${layout}, exactly one pose per cell, in reading order (left to right, then top to bottom) as the animation order. Each pose sits fully inside its own cell, centered, with generous empty space on all sides: nothing (limbs, tools, rotor blades, capes, tails, effects) may touch or cross the edges of its cell or touch another pose. Same size and same art style in every pose. Side view with the character facing RIGHT: the front of the character or of its vehicle (face, nose, cockpit) points toward the right edge of the image. ${POSES(flight)[movement][kind]}. ${STYLE_PROMPT[style]}. Each pose shows the whole body fully visible and not cropped. ${BACKDROP} background everywhere, no grid lines, no borders, no shadows, no ground line, no text, no numbers.`;
}

interface ImageResponse {
	data?: { b64_json?: string }[];
	output_format?: string;
}

/** Reintentos cuando el filtro de contenido bloquea la imagen. */
const BLOCK_RETRIES = 2;

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
	let text = '';
	// El filtro de contenido de Meta a veces bloquea un pedido inofensivo y deja pasar el mismo al reintentar.
	for (let attempt = 0; ; attempt++) {
		const res = await fetchImpl(
			`${media.baseUrl}/images/${opts.reference ? 'edits' : 'generations'}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${media.apiKey}` },
				body: JSON.stringify(body)
			}
		);
		text = await res.text();
		if (res.ok) break;
		const err = upstreamError(res.status, text);
		if (err.status !== 422 || attempt >= BLOCK_RETRIES) throw err;
	}
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

/** Tamaño pedido para cada imagen: el personaje solo, cuadrado; las hojas de poses, en la proporción de su grilla. */
export const SIZE = {
	hero: '1024x1024',
	grid: '1536x1024',
	stand: '1536x768',
	scene: '1536x864'
} as const;
export const sizeFor = (kind: StripKind): string =>
	kind === 'stand' || kind === 'item' ? SIZE.stand : SIZE.grid;

// ---------- Spark: ¿hacia dónde mira? ----------

export const FACING_JSON_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['facing'],
	properties: { facing: { type: 'string', enum: ['left', 'right', 'front', 'unclear'] } }
};
const FacingSchema = z.object({ facing: z.enum(['left', 'right', 'front', 'unclear']) });
export type Facing = z.infer<typeof FacingSchema>['facing'];

/** Hacia dónde mira el personaje (o su vehículo) en una imagen; sirve para espejarla si mira a la izquierda. */
export async function detectFacing(
	image: string,
	config: LlmConfig,
	fetchImpl: typeof fetch = fetch
): Promise<Facing> {
	const messages: Message[] = [
		{
			role: 'user',
			content: [
				{
					type: 'text',
					text: 'The image shows a game character (possibly several poses of it). Looking at the character, or the vehicle it rides if any, which side of the image does its FRONT point to (face, nose, cockpit, direction of travel)? "right" or "left" for a side view, "front" if it looks at the viewer, "unclear" if you cannot tell or the poses disagree.'
				},
				{ type: 'image_url', image_url: { url: image } }
			]
		}
	];
	return (await askJson(messages, config, fetchImpl, FacingSchema, FACING_JSON_SCHEMA, 'facing'))
		.facing;
}

// ---------- Spark: retocar la descripción ----------

export const REFINE_JSON_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['status', 'message', 'visual', 'noun', 'flight'],
	properties: {
		status: { type: 'string', enum: ['ok', 'clarify', 'refuse'] },
		message: { type: 'string' },
		visual: { type: 'string' },
		noun: { type: 'string' },
		flight: { type: 'string' }
	}
};
const RefineSchema = z.object({
	status: z.enum(['ok', 'clarify', 'refuse']),
	message: z.string(),
	visual: z.string(),
	noun: z.string(),
	flight: z.string()
});
export type Refined = z.infer<typeof RefineSchema>;

/** Aplica un pedido de cambio ("que la gorra sea roja", "el helicóptero no gira") a la descripción del personaje. */
export async function refineBrief(
	req: { visual: string; noun: string; flight: string; instruction: string; lang: 'es' | 'en' },
	config: LlmConfig,
	fetchImpl: typeof fetch = fetch
): Promise<Refined> {
	const language = req.lang === 'es' ? 'Spanish' : 'English';
	const messages: Message[] = [
		{
			role: 'system',
			content: `You update the description of an existing game character after the user asks for a change.
Current description (visual): ${req.visual}
Current segmentation noun: ${req.noun}
Current way of moving/flying: ${req.flight || '(none)'}
Answer with JSON only:
- status: "ok" if the change is clear and allowed; "clarify" if you cannot tell what to change; "refuse" for real people, famous copyrighted characters, brands, violence, sexual or hateful content.
- message: for "clarify" ask ONE short question in ${language}; for "refuse" a short polite reason in ${language}; otherwise an empty string.
- visual: the FULL updated ENGLISH visual description (max 60 words) with ONLY the requested change applied and everything else kept. If the change is only about how it moves, keep it as is.
- noun: the ENGLISH segmentation noun (kind of creature or object plus at most one color; name the whole visible object, e.g. the vehicle if it pilots one); keep the current one unless the change alters what the character is.
- flight: the ENGLISH one-sentence description of how it moves/flies; update it if the request is about the movement or animation (e.g. "the rotor does not spin" -> make the spinning motion explicit); otherwise keep the current one. Never add wings unless asked.`
		},
		{ role: 'user', content: req.instruction }
	];
	return askJson(messages, config, fetchImpl, RefineSchema, REFINE_JSON_SCHEMA, 'character_refine');
}

// ---------- fondos ----------

/** Fondo de juego de desplazamiento lateral: con sendero (caminantes) o solo cielo (voladores). */
export function scenePrompt(visual: string, style: StyleId, movement: Movement): string {
	const where =
		movement === 'walk'
			? 'A flat path or ground runs horizontally along the lower part of the picture and everything below its top edge is path or ground; the area above it is the scenery.'
			: 'Open sky scenery with no ground visible at the bottom.';
	return `Wide 16:9 side-scrolling video game background, no characters, no creatures in the foreground, no text, no UI. Scene: ${visual}. ${STYLE_PROMPT[style]}. ${where} The center band stays calm and uncluttered, soft and low contrast, so notes and stars drawn over it stay readable. The left and right edges match so the image repeats seamlessly.`;
}

export const GROUND_JSON_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['ground'],
	properties: { ground: { type: 'number' } }
};
const GroundSchema = z.object({ ground: z.number() });

/** En qué fracción del alto (0 arriba, 1 abajo) empieza el suelo por donde camina el personaje; 0,5–0,95. */
export async function detectGround(
	image: string,
	config: LlmConfig,
	fetchImpl: typeof fetch = fetch
): Promise<number> {
	const messages: Message[] = [
		{
			role: 'user',
			content: [
				{
					type: 'text',
					text: 'This is the background of a side-scrolling game. At what fraction of the image height (0 = top edge, 1 = bottom edge) is the top edge of the flat ground or path where a character would stand and walk? Answer with a number between 0.5 and 0.95.'
				},
				{ type: 'image_url', image_url: { url: image } }
			]
		}
	];
	const { ground } = await askJson(
		messages,
		config,
		fetchImpl,
		GroundSchema,
		GROUND_JSON_SCHEMA,
		'ground'
	);
	return Math.min(0.95, Math.max(0.5, ground));
}
