import { describe, expect, it } from 'vitest';
import {
	applyNoteNames,
	extractJson,
	noteNameToMidi,
	toCode,
	validateGenerated,
	type GeneratedExercise
} from '../src/lib/ai/exercise';
import { configFromEnv, generateExercise, GenerateError } from '../src/lib/ai/generate';
import {
	CharacterRequestSchema,
	makeBrief,
	MAX_THREAD,
	reviewStrip,
	stripPrompt
} from '../src/lib/ai/character';
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

describe('partituras: semitonos desde los nombres de nota', () => {
	it('entiende nombres con alteraciones', () => {
		expect(noteNameToMidi('C4')).toBe(60);
		expect(noteNameToMidi('Bb3')).toBe(58);
		expect(noteNameToMidi('F#3')).toBe(54);
		expect(noteNameToMidi('B♭3')).toBe(58);
		expect(noteNameToMidi('H2')).toBeNull();
	});

	it('recalcula s desde los nombres y los quita', () => {
		const read = {
			...VALID,
			notes: [
				{ d: 2, s: 5, hint: true },
				{ d: 1.5, s: 0, n: 'F3' },
				{ d: 0.5, s: 9, n: 'G3' }, // la cuenta del modelo estaba mal: vale el nombre
				{ d: 1, s: 0, rest: true },
				{ d: 1, s: 0, n: 'Bb3' },
				{ d: 1, s: 0, n: 'C3' }
			]
		};
		const fixed = applyNoteNames(read);
		expect(fixed.notes.map((n) => n.s)).toEqual([0, 0, 2, 0, 5, -5]);
		expect(fixed.notes.every((n) => !('n' in n))).toBe(true);
	});

	it('si falta algún nombre, deja los s del modelo', () => {
		const partial = {
			...VALID,
			notes: [
				{ d: 1, s: 0, n: 'F3' },
				{ d: 1, s: 4 }
			]
		};
		expect(applyNoteNames(partial).notes.map((n) => n.s)).toEqual([0, 4]);
	});
});

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

	it('acepta los null de los esquemas estrictos (Meta) en los campos opcionales', async () => {
		const strict = {
			...VALID,
			notes: VALID.notes.map((n) => ({
				rest: null,
				hint: null,
				legato: null,
				staccato: null,
				...n
			}))
		};
		const { fetchImpl } = fakeModel([JSON.stringify(strict)]);
		const result = await generateExercise({ prompt: 'x', lang: 'es' }, config, fetchImpl);
		expect(result.attempts).toBe(1);
		expect(result.exercise.notes[1].rest).toBeUndefined();
		expect(result.exercise.notes[0].hint).toBe(true);
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
		expect(configFromEnv({ LLM_BASE_URL: 'https://api.meta.ai/v1' }).reasoningEffort).toBe('low');
	});

	it('a Meta le manda reasoning_effort (no el parámetro de OpenRouter)', async () => {
		const { calls, fetchImpl } = fakeModel([JSON.stringify(VALID)]);
		const meta = configFromEnv({ LLM_API_KEY: 'k', LLM_BASE_URL: 'https://api.meta.ai/v1' });
		await generateExercise({ prompt: 'x', lang: 'es' }, meta, fetchImpl);
		const body = calls[0] as unknown as Record<string, unknown>;
		expect(body.reasoning_effort).toBe('low');
		expect(body.reasoning).toBeUndefined();
	});

	it('envía reasoning desactivado y el tope de tokens', async () => {
		const { calls, fetchImpl } = fakeModel([JSON.stringify(VALID)]);
		await generateExercise({ prompt: 'x', lang: 'es' }, config, fetchImpl);
		const body = calls[0] as unknown as Record<string, unknown>;
		expect(body.reasoning).toEqual({ enabled: false });
		expect(body.max_tokens).toBe(8000);
	});
});

describe('imágenes: Spark lee primero y Wonder en clave de fa o a pedido', () => {
	const IMAGE = 'data:image/png;base64,AAAA';
	const meta = configFromEnv({
		LLM_API_KEY: 'k',
		LLM_BASE_URL: 'https://api.meta.ai/v1',
		LLM_MODEL: 'muse-spark-1.3-contributor'
	});
	const read = (extra: Record<string, unknown>) => JSON.stringify({ ...VALID, ...extra });
	const modelsOf = (calls: unknown[]) => calls.map((c) => (c as { model: string }).model);

	it('con Meta, el lector fuerte es Wonder por defecto; con otro proveedor, el mismo modelo', () => {
		expect(meta.visionModel).toBe('muse-wonder-1.0');
		expect(
			configFromEnv({ LLM_BASE_URL: 'https://api.meta.ai/v1', LLM_VISION_MODEL: 'x' }).visionModel
		).toBe('x');
		const other = configFromEnv({ LLM_BASE_URL: 'https://example.com/v1', LLM_MODEL: 'm' });
		expect(other.visionModel).toBe('m');
	});

	it('una partitura en clave de sol la lee Spark y nada más', async () => {
		const { calls, fetchImpl } = fakeModel([read({ kind: 'score', clef: 'treble' })]);
		const r = await generateExercise({ prompt: '', image: IMAGE, lang: 'es' }, meta, fetchImpl);
		expect(modelsOf(calls)).toEqual(['muse-spark-1.3-contributor']);
		expect(r.engine).toBe('spark');
	});

	it('si Spark ve la clave de fa, la vuelve a leer sola con Wonder', async () => {
		const { calls, fetchImpl } = fakeModel([
			read({ kind: 'score', clef: 'bass', name: 'Spark' }),
			read({ kind: 'score', clef: 'bass', name: 'Wonder' })
		]);
		const r = await generateExercise({ prompt: '', image: IMAGE, lang: 'es' }, meta, fetchImpl);
		expect(modelsOf(calls)).toEqual(['muse-spark-1.3-contributor', 'muse-wonder-1.0']);
		expect(r.exercise.name).toBe('Wonder');
		expect(r.engine).toBe('wonder');
	});

	it('si Wonder falla al releer, queda la lectura de Spark', async () => {
		let n = 0;
		const fetchImpl = (async () => {
			n++;
			if (n > 1) return new Response('boom', { status: 500 });
			return new Response(
				JSON.stringify({
					choices: [{ message: { content: read({ kind: 'score', clef: 'bass', name: 'Spark' }) } }]
				}),
				{ status: 200 }
			);
		}) as unknown as typeof fetch;
		const r = await generateExercise({ prompt: '', image: IMAGE, lang: 'es' }, meta, fetchImpl);
		expect(r.exercise.name).toBe('Spark');
		expect(r.engine).toBe('spark');
	});

	it('pedir Wonder lo usa directo, sin pasar por Spark', async () => {
		const { calls, fetchImpl } = fakeModel([read({ kind: 'score', clef: 'treble' })]);
		const r = await generateExercise(
			{ prompt: '', image: IMAGE, lang: 'es', engine: 'wonder' },
			meta,
			fetchImpl
		);
		expect(modelsOf(calls)).toEqual(['muse-wonder-1.0']);
		expect(r.engine).toBe('wonder');
	});

	it('sin un lector distinto no hay relectura', async () => {
		const same = { ...meta, visionModel: meta.model };
		const { calls, fetchImpl } = fakeModel([read({ kind: 'score', clef: 'bass' })]);
		await generateExercise({ prompt: '', image: IMAGE, lang: 'es' }, same, fetchImpl);
		expect(calls).toHaveLength(1);
	});

	it('pide el esquema de imagen (con tipo, clave y pregunta)', async () => {
		const { calls, fetchImpl } = fakeModel([read({ kind: 'score', clef: 'treble' })]);
		await generateExercise({ prompt: '', image: IMAGE, lang: 'es' }, meta, fetchImpl);
		const body = calls[0] as unknown as {
			response_format: { json_schema: { name: string; schema: { required: string[] } } };
		};
		expect(body.response_format.json_schema.name).toBe('vocal_exercise_from_image');
		expect(body.response_format.json_schema.schema.required).toEqual(
			expect.arrayContaining(['kind', 'clef', 'ask'])
		);
	});

	it('un dibujo sin escala ni texto devuelve la pregunta del modelo', async () => {
		const { fetchImpl } = fakeModel([
			read({ kind: 'drawing', clef: null, ask: '¿En qué escala?' })
		]);
		const r = await generateExercise({ prompt: '', image: IMAGE, lang: 'es' }, meta, fetchImpl);
		expect(r.ask).toBe('¿En qué escala?');
	});

	it('si la persona ya escribió algo, la pregunta se ignora y se crea el ejercicio', async () => {
		const { fetchImpl } = fakeModel([
			read({ kind: 'drawing', clef: null, ask: '¿En qué escala?' })
		]);
		const r = await generateExercise(
			{ prompt: 'en do mayor', image: IMAGE, lang: 'es' },
			meta,
			fetchImpl
		);
		expect(r.ask).toBeUndefined();
		expect(r.code).toContain('@name:');
	});
});

describe('revisión de hojas de poses con Wonder', () => {
	const IMG = 'data:image/jpeg;base64,AAAA';
	const meta = configFromEnv({ LLM_API_KEY: 'k', LLM_BASE_URL: 'https://api.meta.ai/v1' });

	it('mira la hoja y el personaje con Wonder y devuelve a lo sumo 3 problemas', async () => {
		const { calls, fetchImpl } = fakeModel([
			JSON.stringify({ ok: false, problems: ['a', 'b', 'c', 'd'] })
		]);
		const r = await reviewStrip({ kind: 'move', image: IMG, reference: IMG }, meta, fetchImpl);
		expect(r).toEqual({ ok: false, problems: ['a', 'b', 'c'] });
		const body = calls[0] as unknown as {
			model: string;
			messages: { content: { type: string }[] }[];
		};
		expect(body.model).toBe('muse-wonder-1.0');
		expect(body.messages[0].content.filter((p) => p.type === 'image_url')).toHaveLength(2);
	});

	it('el pedido de una hoja que falló lleva lo que hay que corregir', () => {
		expect(stripPrompt('move', 'a fox', 'cute3d', 'walk')).not.toContain('IMPORTANT');
		expect(
			stripPrompt('move', 'a fox', 'cute3d', 'walk', undefined, 'Draw exactly 6 poses.')
		).toContain('fix this problem from the previous attempt: Draw exactly 6 poses.');
	});
});

describe('preguntas de la IA al crear: la conversación sigue', () => {
	const meta = configFromEnv({ LLM_API_KEY: 'k', LLM_BASE_URL: 'https://api.meta.ai/v1' });
	const OK = JSON.stringify({
		status: 'ok',
		message: '',
		name: 'Zorro',
		noun: 'fox',
		visual: 'an orange fox',
		flight: ''
	});
	type Body = { messages: { role: string; content: string }[] };

	it('sin respuestas va solo el pedido', async () => {
		const { calls, fetchImpl } = fakeModel([OK]);
		await makeBrief({ prompt: 'algo lindo', lang: 'es' }, meta, fetchImpl);
		expect((calls[0] as unknown as Body).messages.map((m) => m.role)).toEqual(['system', 'user']);
	});

	it('la pregunta y la respuesta se agregan como turnos del chat, en orden', async () => {
		const { calls, fetchImpl } = fakeModel([OK]);
		await makeBrief(
			{
				prompt: 'algo lindo',
				lang: 'es',
				thread: [{ q: '¿Qué animal?', a: 'un zorro' }]
			},
			meta,
			fetchImpl
		);
		const m = (calls[0] as unknown as Body).messages;
		expect(m.map((x) => x.role)).toEqual(['system', 'user', 'assistant', 'user']);
		expect(m[2].content).toContain('¿Qué animal?');
		expect(m[2].content).toContain('"status":"clarify"');
		expect(m[3].content).toBe('un zorro');
	});

	it('a la última ronda se le pide que ya no pregunte', async () => {
		const { calls, fetchImpl } = fakeModel([OK]);
		const thread = Array.from({ length: MAX_THREAD }, (_, i) => ({ q: `q${i}`, a: `a${i}` }));
		await makeBrief({ prompt: 'x', lang: 'en', thread }, meta, fetchImpl);
		const users = (calls[0] as unknown as Body).messages.filter((m) => m.role === 'user');
		expect(users[1].content).toBe('a0');
		expect(users[MAX_THREAD].content).toContain('Do not ask anything else');
	});

	it('el servidor acepta hasta MAX_THREAD respuestas y rechaza más', () => {
		const base = { action: 'brief', prompt: 'x' };
		const turns = (n: number) => Array.from({ length: n }, () => ({ q: 'q', a: 'a' }));
		expect(CharacterRequestSchema.safeParse({ ...base, thread: turns(MAX_THREAD) }).success).toBe(
			true
		);
		expect(
			CharacterRequestSchema.safeParse({ ...base, thread: turns(MAX_THREAD + 1) }).success
		).toBe(false);
		expect(CharacterRequestSchema.safeParse(base).success).toBe(true);
	});
});
