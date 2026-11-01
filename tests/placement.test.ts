import { afterEach, describe, expect, it, vi } from 'vitest';
import { exercises, levelExercise } from '../src/lib/exercises/catalog';
import { outcome, stageExercise, STAGES } from '../src/lib/exercises/placement';
import {
	clearPlacementStage,
	finishPlacement,
	loadPassedStages,
	loadPlacementStage,
	savePlacementStage
} from '../src/lib/exercises/placementProgress';
import { generateSequence } from '../src/lib/music/generate';

describe('prueba de nivel', () => {
	it('cada nivel del catálogo tiene 10 ejercicios', () => {
		for (const level of ['1', '2', '3'])
			expect(exercises.filter((e) => e.level === level)).toHaveLength(10);
	});

	it('las etapas son 4 del nivel 1 y 2 de cada uno de los niveles 2 y 3', () => {
		expect(Array.from({ length: STAGES }, (_, i) => stageExercise(i).name)).toEqual([
			'Nota simple repetida',
			'Escala mayor 3 notas',
			'Escala menor 3 notas',
			'Escala mayor 4 notas',
			'Escala mayor 5 notas',
			'Escala mayor 6 notas',
			'Escala mayor 7 notas',
			'Escala mayor 8 notas'
		]);
		expect(Array.from({ length: STAGES }, (_, i) => stageExercise(i).level)).toEqual([
			'1',
			'1',
			'1',
			'1',
			'2',
			'2',
			'3',
			'3'
		]);
	});

	it('si no pasa, aconseja empezar más abajo según la etapa', () => {
		const start = (stage: number) => outcome(stage, 80).startAt?.name;
		expect(start(0)).toBe('Nota simple repetida');
		expect(start(1)).toBe('Escala mayor 2 notas');
		expect(start(2)).toBe('Arpegio mayor 2 notas');
		expect(start(3)).toBe('Arpegio menor 2 notas');
		expect(start(4)).toBe('Escala menor 4 notas');
		expect(start(5)).toBe('Escala mayor 5 notas');
		expect(start(6)).toBe('Escala mayor ágil');
		expect(start(7)).toBe('Escala mayor 7 notas');
	});

	it('con 85% o más pasa y sigue; tras la última etapa recomienda seguir en el nivel 3', () => {
		expect(outcome(0, 85)).toEqual({ passed: true, startAt: null });
		expect(outcome(3, 100)).toEqual({ passed: true, startAt: null });
		expect(outcome(STAGES - 1, 100).startAt).toBe(levelExercise('3', 3));
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

describe('progreso guardado de la prueba', () => {
	const store = new Map<string, string>();
	vi.stubGlobal('localStorage', {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => void store.set(k, v),
		removeItem: (k: string) => void store.delete(k)
	});
	afterEach(() => store.clear());

	it('guarda la etapa en que se dejó y la recupera', () => {
		expect(loadPlacementStage()).toBeNull();
		savePlacementStage(3);
		expect(loadPlacementStage()).toBe(3);
	});

	it('con la primera etapa o una inválida no queda nada guardado', () => {
		savePlacementStage(3);
		savePlacementStage(0);
		expect(loadPlacementStage()).toBeNull();
		savePlacementStage(STAGES);
		expect(loadPlacementStage()).toBeNull();
	});

	it('ignora datos rotos y se puede borrar', () => {
		store.set('singmaker-placement', '{no es json');
		expect(loadPlacementStage()).toBeNull();
		savePlacementStage(2);
		clearPlacementStage();
		expect(loadPlacementStage()).toBeNull();
	});

	it('guarda las etapas aprobadas, también a medias y al terminar', () => {
		expect(loadPassedStages()).toBeNull();
		savePlacementStage(3);
		expect(loadPassedStages()).toBe(3);
		finishPlacement(5);
		expect(loadPlacementStage()).toBeNull();
		expect(loadPassedStages()).toBe(5);
		finishPlacement(0);
		expect(loadPassedStages()).toBe(0);
		finishPlacement(STAGES + 1);
		expect(loadPassedStages()).toBe(0);
	});
});

describe('Nota simple repetida', () => {
	it('la guía es una blanca y la nota a cantar otra blanca (4 tiempos)', () => {
		const e = exercises.find((x) => x.name === 'Nota simple repetida')!;
		const notes = e.parsed.notes;
		expect(notes.map((n) => [n.duration, !!n.isHint])).toEqual([
			[2, true],
			[2, false]
		]);
	});
});
