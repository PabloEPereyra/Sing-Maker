import { describe, expect, it } from 'vitest';
import {
	drumTracks,
	generateDrumPattern,
	STEPS_PER_MEASURE,
	validateDrum,
	type GeneratedDrum
} from '../src/lib/ai/drums';
import { configFromEnv, GenerateError } from '../src/lib/ai/generate';
import { DRUM_PATTERNS, hitsAt, patternSteps } from '../src/lib/audio/drums';

const blank = (n: number) => '.'.repeat(n);

function drum(
	meter: '4/4' | '6/8',
	measures = 1,
	over: Partial<GeneratedDrum> = {}
): GeneratedDrum {
	const n = STEPS_PER_MEASURE[meter] * measures;
	const kick = 'x' + blank(n - 1);
	return {
		name: 'Prueba',
		measures,
		kick,
		snare: blank(n / 2) + 'x' + blank(n / 2 - 1),
		hihatClosed: 'x.'.repeat(n / 2),
		hihatOpen: blank(n),
		ride: blank(n),
		splash: blank(n),
		...over
	};
}

describe('patrones de batería (IA)', () => {
	it('acepta una grilla bien formada en cada compás', () => {
		expect(validateDrum(drum('4/4', 2), '4/4')).toEqual([]);
		expect(validateDrum(drum('6/8', 1), '6/8')).toEqual([]);
	});

	it('rechaza largos que no coinciden con el compás', () => {
		const errors = validateDrum(drum('4/4'), '6/8');
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toContain('12');
	});

	it('rechaza caracteres inválidos, compases raros y patrones casi vacíos', () => {
		expect(validateDrum(drum('4/4', 1, { kick: 'X' + blank(15) }), '4/4').join()).toContain('only');
		expect(validateDrum(drum('4/4', 3), '4/4').join()).toContain('measures');
		const empty = drum('4/4', 1, { kick: blank(16), snare: blank(16), hihatClosed: blank(16) });
		expect(validateDrum(empty, '4/4').length).toBeGreaterThan(0);
	});

	it('descarta los instrumentos mudos', () => {
		expect(Object.keys(drumTracks(drum('4/4')))).toEqual(['kick', 'snare', 'hihatClosed']);
	});

	it('los patrones de fábrica miden compases enteros', () => {
		for (const p of DRUM_PATTERNS) {
			const per = STEPS_PER_MEASURE[p.meter];
			expect(patternSteps(p) % per).toBe(0);
			expect(hitsAt(p, 0).length).toBeGreaterThan(0);
		}
	});

	it('pide una corrección cuando el modelo se equivoca y devuelve el patrón válido', async () => {
		const bad = { ...drum('6/8'), kick: 'x' };
		const good = drum('6/8');
		const answers = [bad, good];
		const seen: string[] = [];
		const fetchImpl = (async (_url: string, init: { body: string }) => {
			const body = JSON.parse(init.body);
			seen.push(body.messages.at(-1).content);
			return new Response(
				JSON.stringify({ choices: [{ message: { content: JSON.stringify(answers.shift()) } }] })
			);
		}) as unknown as typeof fetch;
		const cfg = configFromEnv({ LLM_API_KEY: 'k', LLM_BASE_URL: 'https://api.meta.ai/v1' });
		const res = await generateDrumPattern(
			{ prompt: 'balada', meter: '6/8', lang: 'es' },
			cfg,
			fetchImpl
		);
		expect(res.attempts).toBe(2);
		expect(res.tracks.kick).toBe(good.kick);
		expect(seen[1]).toContain('not valid');
	});

	it('sin clave falla antes de llamar al modelo', async () => {
		await expect(
			generateDrumPattern({ prompt: 'x', meter: '4/4', lang: 'en' }, configFromEnv({}))
		).rejects.toBeInstanceOf(GenerateError);
	});
});
