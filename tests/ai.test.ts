import { describe, expect, it } from 'vitest';
import {
	extractJson,
	toCode,
	validateGenerated,
	type GeneratedExercise
} from '../src/lib/ai/exercise';
import { configFromEnv, generateExercise, GenerateError } from '../src/lib/ai/generate';
import { parse } from '../src/lib/music/parser';

const VALID: GeneratedExercise = {
	name: 'Arpegio mayor',
	description: 'Arpegio mayor | 1-3-5-3-1 | corcheas',
	bpm: 72,
	beatsPerMeasure: 4,
	direction: 'asc',
	syllable: 'nu',
	notes: [
		{ d: 2, s: 0, hint: true },
		{ d: 0.5, s: 0 },
		{ d: 0.5, s: 4 },
		{ d: 0.5, s: 7 },
		{ d: 0.5, s: 4 },
		{ d: 0.5, s: 0, rest: true },
		{ d: 1.5, s: 0 }
	]
};

describe('formato generado', () => {
	it('se convierte al formato de texto y el parser lo entiende igual', () => {
		const { meta, notes } = parse(toCode(VALID));
		expect(meta.name).toBe('Arpegio mayor');
		expect(meta.bpm).toBe(72);
		expect(meta.syllable).toBe('nu');
		expect(notes.map((n) => n.duration)).toEqual(VALID.notes.map((n) => n.d));
		expect(notes[0].isHint).toBe(true);
		expect(notes[2].semitones).toBe(4);
		expect(notes[5].isRest).toBe(true);
	});

	it('conserva ligado y staccato', () => {
		const marked = {
			...VALID,
			notes: [...VALID.notes, { d: 1, s: 2, legato: true, staccato: true }]
		};
		const last = parse(toCode(marked)).notes.at(-1)!;
		expect(last.legato).toBe(true);
		expect(last.staccato).toBe(true);
	});

	it('valida reglas musicales', () => {
		expect(validateGenerated(VALID)).toEqual([]);
		const bad = { ...VALID, bpm: 300, notes: [{ d: 0.3, s: 30 }] };
		const errors = validateGenerated(bad);
		expect(errors.some((e) => e.includes('bpm'))).toBe(true);
		expect(errors.some((e) => e.includes('duration'))).toBe(true);
		expect(errors.some((e) => e.includes('semitones'))).toBe(true);
	});

	it('rechaza patrones más amplios que el rango de la persona', () => {
		const wide = { ...VALID, notes: [...VALID.notes, { d: 1, s: 16 }] };
		expect(validateGenerated(wide, { low: 48, high: 60 }).join()).toMatch(/range/);
	});

	it('extrae JSON aunque venga entre ``` o con texto', () => {
		expect(extractJson('Aquí va:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
		expect(extractJson('ok {"b":2} listo')).toEqual({ b: 2 });
	});
});

/** Modelo simulado: devuelve las respuestas en orden y guarda lo que recibió. */
function fakeModel(answers: string[]) {
	const calls: { messages: { role: string; content: string }[] }[] = [];
	const fetchImpl = (async (_url: string, init: RequestInit) => {
		calls.push(JSON.parse(String(init.body)));
		const content = answers[calls.length - 1];
		return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
	}) as unknown as typeof fetch;
	return { calls, fetchImpl };
}

describe('bucle de generación', () => {
	const config = { ...configFromEnv({ LLM_API_KEY: 'test' }) };

	it('corrige: si el primer intento es inválido, reenvía los errores al modelo', async () => {
		const { calls, fetchImpl } = fakeModel([
			JSON.stringify({ ...VALID, bpm: 500 }),
			JSON.stringify(VALID)
		]);
		const result = await generateExercise({ prompt: 'arpegio', lang: 'es' }, config, fetchImpl);
		expect(result.attempts).toBe(2);
		expect(result.exercise.bpm).toBe(72);
		const feedback = calls[1].messages.at(-1)!.content;
		expect(feedback).toMatch(/bpm must be between/);
	});

	it('se rinde tras 3 intentos con los errores', async () => {
		const { fetchImpl } = fakeModel(['no json', 'tampoco', '{"name": 1}']);
		await expect(
			generateExercise({ prompt: 'x', lang: 'en' }, config, fetchImpl)
		).rejects.toBeInstanceOf(GenerateError);
	});

	it('usa OpenRouter con Nemotron gratis por defecto y se cambia por variables', () => {
		expect(configFromEnv({}).model).toBe('nvidia/nemotron-3.5-super-vl:free');
		const meta = configFromEnv({ LLM_BASE_URL: 'https://example.com/v1/', LLM_MODEL: 'muse' });
		expect(meta.baseUrl).toBe('https://example.com/v1');
		expect(meta.model).toBe('muse');
	});

	it('apaga el razonamiento solo en OpenRouter (si no se configura otra cosa)', () => {
		expect(configFromEnv({}).reasoningEffort).toBe('none');
		expect(
			configFromEnv({ LLM_BASE_URL: 'https://example.com/v1' }).reasoningEffort
		).toBeUndefined();
		expect(configFromEnv({ LLM_REASONING_EFFORT: 'low' }).reasoningEffort).toBe('low');
	});

	it('envía reasoning desactivado y el tope de tokens', async () => {
		const { calls, fetchImpl } = fakeModel([JSON.stringify(VALID)]);
		await generateExercise({ prompt: 'x', lang: 'es' }, config, fetchImpl);
		const body = calls[0] as unknown as Record<string, unknown>;
		expect(body.reasoning).toEqual({ enabled: false });
		expect(body.max_tokens).toBe(8000);
	});
});
