import { describe, expect, it } from 'vitest';
import { bestShift, looksDesynced, type PitchSample, type Star } from '../src/lib/game/scoring';

/** 24 estrellas, una cada 0,4 s, que alternan entre dos alturas (como una escala corta). */
const stars: Star[] = Array.from({ length: 24 }, (_, i) => ({
	noteId: i,
	rep: 0,
	time: 1 + i * 0.4,
	midi: i % 2 ? 62 : 60,
	state: 'idle',
	changedAt: 0
}));

/** Voz perfecta pero retrasada `lag` segundos: cada nota dura 0,4 s. */
function sung(lag: number): PitchSample[] {
	const out: PitchSample[] = [];
	for (let t = 0; t < 12; t += 1 / 60) {
		const i = Math.floor((t - lag - 0.8) / 0.4);
		out.push({ time: t, midi: i >= 0 && i < 24 ? (i % 2 ? 62 : 60) : null });
	}
	return out;
}

describe('desfase de la voz', () => {
	it('sin desfase no propone corrimiento', () => {
		const fit = bestShift(stars, sung(0), 0.6);
		expect(fit.shift).toBe(0);
		expect(looksDesynced(fit, stars.length)).toBe(false);
	});

	it('una voz atrasada 300 ms se corrige con un corrimiento negativo', () => {
		const fit = bestShift(stars, sung(0.3), 0.6);
		expect(fit.shift).toBeLessThan(-0.1);
		expect(fit.hits).toBeGreaterThan(fit.base);
		expect(looksDesynced(fit, stars.length)).toBe(true);
	});

	it('una voz adelantada se corrige con un corrimiento positivo', () => {
		const fit = bestShift(stars, sung(-0.3), 0.6);
		expect(fit.shift).toBeGreaterThan(0.1);
		expect(looksDesynced(fit, stars.length)).toBe(true);
	});

	it('no avisa si casi no se cantó', () => {
		const fit = bestShift(stars, [], 0.6);
		expect(looksDesynced(fit, stars.length)).toBe(false);
	});
});
