// Patrones de batería con IA: el modelo escribe una grilla de pasos por instrumento (las muestras de la
// app suenan con eso) y el código la valida, igual que con los ejercicios. Lo usa el servidor, así que
// solo importa con rutas relativas.
import { z } from 'zod';
import { extractJson } from './exercise';
import { complete, GenerateError, type LlmConfig, type Message } from './generate';

export const DRUM_PARTS = ['kick', 'snare', 'hihatClosed', 'hihatOpen', 'ride', 'splash'] as const;
export type DrumPartName = (typeof DRUM_PARTS)[number];
export type DrumMeterId = '4/4' | '6/8';

/** Pasos por compás: 16 semicorcheas en 4/4; 12 en 6/8 (2 por corchea). */
export const STEPS_PER_MEASURE: Record<DrumMeterId, number> = { '4/4': 16, '6/8': 12 };
/** Pasos por pulso del metrónomo (negra en 4/4, corchea en 6/8). */
export const STEPS_PER_TICK: Record<DrumMeterId, number> = { '4/4': 4, '6/8': 2 };
const MEASURE_CHOICES = [1, 2, 4];

export const GeneratedDrumSchema = z.object({
	name: z.string().min(1),
	/** Compases que dura el patrón antes de repetirse. */
	measures: z.number(),
	kick: z.string(),
	snare: z.string(),
	hihatClosed: z.string(),
	hihatOpen: z.string(),
	ride: z.string(),
	splash: z.string()
});
export type GeneratedDrum = z.infer<typeof GeneratedDrumSchema>;

export const GENERATED_DRUM_JSON_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['name', 'measures', ...DRUM_PARTS],
	properties: {
		name: { type: 'string' },
		measures: { type: 'number' },
		...Object.fromEntries(DRUM_PARTS.map((p) => [p, { type: 'string' }]))
	}
} as const;

export interface DrumRequest {
	prompt: string;
	meter: DrumMeterId;
	lang: 'es' | 'en';
}

export interface DrumResult {
	name: string;
	measures: number;
	/** Solo los instrumentos que suenan; un carácter por paso ("x" golpe, "." nada). */
	tracks: Partial<Record<DrumPartName, string>>;
	attempts: number;
	model: string;
}

/** Reglas de forma del patrón. Devuelve los errores redactados para que el modelo los corrija. */
export function validateDrum(d: GeneratedDrum, meter: DrumMeterId): string[] {
	const errors: string[] = [];
	if (!MEASURE_CHOICES.includes(d.measures))
		errors.push(`measures must be 1, 2 or 4 (is ${d.measures}).`);
	const steps = STEPS_PER_MEASURE[meter] * (MEASURE_CHOICES.includes(d.measures) ? d.measures : 1);
	let hits = 0;
	for (const part of DRUM_PARTS) {
		const track = d[part];
		if (!/^[x.]*$/.test(track)) errors.push(`${part}: only "x" and "." are allowed.`);
		else if (track.length !== steps)
			errors.push(
				`${part}: must have exactly ${steps} characters (has ${track.length}). ` +
					`Use "${'.'.repeat(steps)}" if it does not play.`
			);
		hits += (track.match(/x/g) ?? []).length;
	}
	if (hits < 3) errors.push('The pattern needs at least 3 hits in total.');
	if (!/x/.test(d.kick) && !/x/.test(d.snare)) errors.push('Use at least the kick or the snare.');
	return errors;
}

/** Sin los instrumentos mudos. */
export function drumTracks(d: GeneratedDrum): Partial<Record<DrumPartName, string>> {
	const tracks: Partial<Record<DrumPartName, string>> = {};
	for (const part of DRUM_PARTS) if (/x/.test(d[part])) tracks[part] = d[part];
	return tracks;
}

function grid(tracks: Partial<Record<DrumPartName, string>>): string {
	return DRUM_PARTS.map((p) => `  ${p.padEnd(12)} ${tracks[p] ?? ''}`).join('\n');
}

const EXAMPLES: {
	meter: DrumMeterId;
	name: string;
	measures: number;
	tracks: Partial<Record<DrumPartName, string>>;
}[] = [
	{
		meter: '4/4',
		name: 'Rock',
		measures: 2,
		tracks: {
			kick: 'x..x..x...x..x..x..x..x...x.....',
			snare: '....x.......x.......x.......x...',
			hihatClosed: 'x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.',
			splash: '..............................x.'
		}
	},
	{
		meter: '6/8',
		name: 'Balada',
		measures: 2,
		tracks: {
			kick: 'x.....x.....x.....x...x.',
			snare: '......x...........x.....',
			ride: 'x.x.x.x.x.x.x.x.x.x.x.x.',
			hihatOpen: '......................x.'
		}
	}
];

function systemPrompt(req: DrumRequest): string {
	const steps = STEPS_PER_MEASURE[req.meter];
	const feel =
		req.meter === '4/4'
			? '4/4: a measure has 4 beats of 4 steps each (sixteenth notes). Beats fall on steps 0, 4, 8, 12 of every measure.'
			: '6/8: a measure has 6 eighth notes of 2 steps each. The two main pulses fall on steps 0 and 6 of every measure; the eighth notes on every even step.';
	return [
		'You write looping drum patterns that accompany a singer doing vocal warm-ups.',
		`The user asks for a pattern in ${req.meter}. Write it as a step grid. ${feel}`,
		`One measure = ${steps} steps. Choose "measures" (1, 2 or 4): every instrument string must have exactly ${steps} × measures characters, "x" = hit and "." = silence. Use only the instruments that fit the style; give the others a string of "." with the same length.`,
		'Instruments: kick (bass drum), snare, hihatClosed, hihatOpen, ride, splash (crash accent, rarely).',
		'Keep it steady, musical and not too busy: it plays under a voice for several minutes. No long fills; a small variation on the last measure is fine.',
		`Name the pattern briefly in ${req.lang === 'en' ? 'English' : 'Spanish'}, with no time signature in the name (e.g. "Balada suave").`,
		'Answer only with the JSON object.',
		'Example of the format (instrument, then its grid):',
		...EXAMPLES.filter((e) => e.meter === req.meter).map(
			(e) => `"${e.name}", measures ${e.measures}:\n${grid(e.tracks)}`
		)
	].join('\n');
}

const MAX_ATTEMPTS = 3;

export async function generateDrumPattern(
	req: DrumRequest,
	config: LlmConfig,
	fetchImpl: typeof fetch = fetch
): Promise<DrumResult> {
	if (!config.apiKey) throw new GenerateError('Missing LLM_API_KEY on the server.', 500);
	const prompt = req.prompt.trim().slice(0, 500);
	if (!prompt) throw new GenerateError('Empty request.', 400);
	const messages: Message[] = [
		{ role: 'system', content: systemPrompt(req) },
		{ role: 'user', content: prompt }
	];
	let lastErrors: string[] = [];
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		const content = await complete(messages, config, config.model, fetchImpl, {
			name: 'drum_pattern',
			schema: GENERATED_DRUM_JSON_SCHEMA
		});
		let errors: string[];
		try {
			const parsed = GeneratedDrumSchema.safeParse(extractJson(content));
			if (parsed.success) {
				errors = validateDrum(parsed.data, req.meter);
				if (!errors.length)
					return {
						name: parsed.data.name.trim().slice(0, 40),
						measures: parsed.data.measures,
						tracks: drumTracks(parsed.data),
						attempts: attempt,
						model: config.model
					};
			} else errors = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
		} catch (e) {
			errors = [`Invalid JSON: ${(e as Error).message}`];
		}
		lastErrors = errors;
		messages.push(
			{ role: 'assistant', content },
			{
				role: 'user',
				content: `The pattern is not valid:\n- ${errors.join('\n- ')}\nFix it and answer with the corrected JSON object only.`
			}
		);
	}
	throw new GenerateError('The model could not produce a valid pattern.', 422, lastErrors);
}
