import { describe, expect, it } from 'vitest';
import { exercises } from '../src/lib/exercises/catalog';
import {
	buildRoutine,
	comfortLevel,
	dayKey,
	doneToday,
	features,
	lastPercent,
	previousPercent,
	type Attempt
} from '../src/lib/practice/routine';

const DAY = 24 * 3600 * 1000;
const NOW = new Date(2026, 9, 31, 12).getTime();
const att = (id: string, pct: number, at = NOW): Attempt => ({ id, pct, at });
const ofLevel = (level: string) => exercises.filter((e) => e.level === level);

describe('historial por ejercicio', () => {
	it('da el último resultado y el anterior', () => {
		const list = [att('a', 40, NOW - 2 * DAY), att('b', 90), att('a', 55, NOW - DAY), att('a', 70)];
		expect(lastPercent(list, 'a')).toBe(70);
		expect(previousPercent(list, 'a')).toBe(55);
		expect(previousPercent(list, 'b')).toBeNull();
		expect(lastPercent(list, 'zzz')).toBeNull();
	});

	it('reconoce lo que se hizo hoy (hora local)', () => {
		const list = [att('a', 50, NOW - DAY), att('b', 50, NOW)];
		expect(doneToday(list, 'a', NOW)).toBe(false);
		expect(doneToday(list, 'b', NOW)).toBe(true);
		expect(dayKey(NOW)).toBe('2026-10-31');
	});
});

describe('nivel cómodo', () => {
	it('sin historial es el 1', () => {
		expect(comfortLevel([], exercises)).toBe(1);
	});

	it('es el más alto con dos ejercicios distintos de 70 % o más', () => {
		const [a, b] = ofLevel('2');
		expect(comfortLevel([att(a.id, 80)], exercises)).toBe(1);
		expect(comfortLevel([att(a.id, 80), att(a.id, 95)], exercises)).toBe(1);
		expect(comfortLevel([att(a.id, 80), att(b.id, 72)], exercises)).toBe(2);
		expect(comfortLevel([att(a.id, 80), att(b.id, 60)], exercises)).toBe(1);
	});
});

describe('rutina de hoy', () => {
	const build = (goal: 'mix' | 'high' | 'pitch' | 'sustain', now = NOW, attempts: Attempt[] = []) =>
		buildRoutine({ pool: exercises, attempts, goal, now });

	it('son 4 ejercicios distintos: calentamiento, dos del objetivo y un desafío', () => {
		const r = build('mix');
		expect(r.map((i) => i.role)).toEqual(['warm', 'goal', 'goal', 'challenge']);
		expect(new Set(r.map((i) => i.exercise.id)).size).toBe(4);
	});

	it('es la misma durante el día y cambia con el objetivo y los días', () => {
		const ids = (goal: 'mix' | 'high', now = NOW) =>
			build(goal, now)
				.map((i) => i.exercise.id)
				.join();
		expect(ids('mix')).toBe(ids('mix', NOW + 3600 * 1000));
		const days = new Set(Array.from({ length: 6 }, (_, d) => ids('mix', NOW + d * DAY)));
		expect(days.size).toBeGreaterThan(1);
		expect(ids('high')).not.toBe(ids('mix'));
	});

	it('empieza en el nivel 1 y sube un escalón con el historial', () => {
		expect(Math.max(...build('mix').map((i) => features(i.exercise).level))).toBeLessThanOrEqual(2);
		const [a, b] = ofLevel('2');
		const r = build('mix', NOW, [att(a.id, 90), att(b.id, 85)]);
		expect(Math.max(...r.map((i) => features(i.exercise).level))).toBe(3);
	});

	it('«agudos» y «notas largas» eligen ejercicios distintos para el objetivo', () => {
		// con el nivel 2 como cómodo hay donde elegir
		const [x, y] = ofLevel('2');
		const history = [att(x.id, 80), att(y.id, 80)];
		const days = Array.from({ length: 7 }, (_, d) => NOW + d * DAY);
		const mean = (goal: 'high' | 'sustain', key: 'top' | 'sustain') => {
			const xs = days.flatMap((now) =>
				build(goal, now, history)
					.filter((i) => i.role === 'goal')
					.map((i) => features(i.exercise)[key])
			);
			return xs.reduce((a, b) => a + b, 0) / xs.length;
		};
		expect(mean('high', 'top')).toBeGreaterThan(mean('sustain', 'top'));
		expect(mean('sustain', 'sustain')).toBeGreaterThan(mean('high', 'sustain'));
	});

	it('sin ejercicios no hay rutina', () => {
		expect(buildRoutine({ pool: [], attempts: [], goal: 'mix', now: NOW })).toEqual([]);
	});
});
