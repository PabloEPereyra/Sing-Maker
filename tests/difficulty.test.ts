import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, nearestDifficulty, stricter, toleranceOf } from '../src/lib/game/difficulty';
import { percentAtTolerance, type PitchSample, type Star } from '../src/lib/game/scoring';

const star = (time: number, midi: number): Star => ({
	noteId: 0,
	rep: 0,
	time,
	midi,
	state: 'idle',
	changedAt: 0
});

describe('dificultad de afinación', () => {
	it('usa los márgenes de Karaoke Star, de más permisivo a más estricto', () => {
		expect(DIFFICULTIES.map((d) => d.cents)).toEqual([100, 75, 50, 25]);
		expect(toleranceOf('normal')).toBe(0.75);
	});

	it('encuentra el nivel más cercano a una tolerancia y el siguiente más estricto', () => {
		expect(nearestDifficulty(0.75)).toBe('normal');
		expect(nearestDifficulty(0.6)).toBe('hard');
		expect(nearestDifficulty(0.3)).toBe('expert');
		expect(stricter('easy')).toBe('normal');
		expect(stricter('expert')).toBeNull();
	});

	it('percentAtTolerance cuenta las estrellas acertadas con otro margen', () => {
		const stars = [star(1, 60), star(2, 60), star(3, 60), star(4, 60)];
		// Voz a 0, 20, 60 y 90 cents de la nota, una lectura cada 10 ms alrededor de cada estrella.
		const offsets = [0, 0.2, 0.6, 0.9];
		const run: PitchSample[] = offsets.flatMap((o, i) =>
			[-0.02, 0, 0.02].map((d) => ({ time: stars[i].time + d, midi: 60 + o }))
		);
		expect(percentAtTolerance(stars, run, 1)).toBe(100);
		expect(percentAtTolerance(stars, run, 0.75)).toBe(75);
		expect(percentAtTolerance(stars, run, 0.5)).toBe(50);
		expect(percentAtTolerance(stars, run, 0.1)).toBe(25);
		expect(percentAtTolerance([], run, 1)).toBe(0);
	});
});
