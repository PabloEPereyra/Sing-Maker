import { describe, expect, it } from 'vitest';
import { exercises, levelExercise } from '../src/lib/exercises/catalog';
import { outcome, STAGE_NUMBERS, stageExercise, STAGES } from '../src/lib/exercises/placement';
import { generateSequence } from '../src/lib/music/generate';

describe('prueba de nivel', () => {
	it('cada nivel del catálogo tiene 10 ejercicios', () => {
		for (const level of ['1', '2', '3'])
			expect(exercises.filter((e) => e.level === level)).toHaveLength(10);
	});

	it('las etapas son los ejercicios 1, 3, 6 y 9 del nivel 1', () => {
		expect(STAGE_NUMBERS.map((_, i) => stageExercise(i).name)).toEqual([
			'Nota simple repetida',
			'Escala mayor 3 notas',
			'Escala menor 3 notas',
			'Escala mayor ágil'
		]);
	});

	it('si no pasa, aconseja empezar más abajo según la etapa', () => {
		const start = (stage: number) => outcome(stage, 80).startAt?.name;
		expect(start(0)).toBe('Nota simple repetida');
		expect(start(1)).toBe('Escala mayor 2 notas');
		expect(start(2)).toBe('Arpegio mayor 2 notas');
		expect(start(3)).toBe('Arpegio menor 2 notas');
	});

	it('con 85% o más pasa; tras la última etapa recomienda el nivel 2', () => {
		expect(outcome(0, 85)).toEqual({ passed: true, startAt: null });
		expect(outcome(STAGES - 1, 100).startAt).toBe(levelExercise('2', 1));
		expect(outcome(1, 84).passed).toBe(false);
	});

	it('spread reparte N tonalidades de graves a agudas', () => {
		const e = stageExercise(1);
		const all = generateSequence(e.parsed.notes, { low: 45, high: 72, direction: 'asc', bpm: 90 });
		const four = generateSequence(e.parsed.notes, {
			low: 45,
			high: 72,
			direction: 'asc',
			bpm: 90,
			spread: 4
		});
		expect(four.reps).toHaveLength(4);
		expect(four.reps[0].rootMidi).toBe(all.reps[0].rootMidi);
		expect(four.reps[3].rootMidi).toBe(all.reps[all.reps.length - 1].rootMidi);
	});
});
