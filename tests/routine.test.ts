import { describe, expect, it } from 'vitest';
import { exercises } from '../src/lib/exercises/catalog';
import {
	buildRoutine,
	comfortLevel,
	dayKey,
	doneToday,
	features,
	GOALS,
	KINDS,
	lastPercent,
	previousPercent,
	shapeScore,
	type Attempt,
	type Goal
} from '../src/lib/practice/routine';
import { TECHNIQUES } from '../src/lib/practice/techniques';

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
	const build = (goal: Goal, now = NOW, attempts: Attempt[] = []) =>
		buildRoutine({ pool: exercises, attempts, goal, now });
	const days = Array.from({ length: 12 }, (_, d) => NOW + d * DAY);

	it('son 4 pasos distintos: calentamiento, resonancia, apertura y objetivo', () => {
		const r = build('mix');
		expect(r.map((i) => i.technique.kind)).toEqual(['warm', 'resonance', 'open', 'focus']);
		expect(new Set(r.map((i) => i.exercise.id)).size).toBe(4);
		expect(new Set(r.map((i) => i.technique.id)).size).toBe(4);
	});

	it('todos los ejercicios son del nivel cómodo de la persona', () => {
		const levels = (attempts: Attempt[]) =>
			new Set(
				days.flatMap((now) => build('mix', now, attempts).map((i) => features(i.exercise).level))
			);
		expect([...levels([])]).toEqual([1]);
		const [a, b] = ofLevel('2');
		expect([...levels([att(a.id, 90), att(b.id, 85)])]).toEqual([2]);
	});

	it('es la misma durante el día y cambia con el objetivo y los días', () => {
		const ids = (goal: Goal, now = NOW) =>
			build(goal, now)
				.map((i) => `${i.technique.id}:${i.exercise.id}`)
				.join();
		expect(ids('mix')).toBe(ids('mix', NOW + 3600 * 1000));
		expect(new Set(days.map((now) => ids('mix', now))).size).toBeGreaterThan(1);
		expect(ids('high')).not.toBe(ids('mix'));
	});

	it('el paso de objetivo usa una técnica que sirve para ese objetivo', () => {
		for (const goal of GOALS) {
			for (const now of days) {
				const focus = build(goal, now).find((i) => i.technique.kind === 'focus');
				expect(focus?.technique.goals).toContain(goal);
			}
		}
	});

	it('cada técnica pide un patrón acorde: notas largas para «sostener», recorrido corto para el trino', () => {
		const level2 = ofLevel('2').map(features);
		const best = (shape: 'sustained' | 'smooth') =>
			level2.reduce((a, b) => (shapeScore(b, shape) > shapeScore(a, shape) ? b : a));
		expect(best('sustained').sustain).toBeGreaterThanOrEqual(best('smooth').sustain);
		expect(best('smooth').span).toBeLessThanOrEqual(best('sustained').span);
	});

	it('sin ejercicios no hay rutina', () => {
		expect(buildRoutine({ pool: [], attempts: [], goal: 'mix', now: NOW })).toEqual([]);
	});
});

describe('técnicas', () => {
	it('todas tienen nombre y explicación en español e inglés, y la de español empieza con «Haz»', () => {
		for (const t of TECHNIQUES) {
			expect(t.name.es && t.name.en && t.how.en).toBeTruthy();
			expect(t.how.es.startsWith('Haz')).toBe(true);
		}
		expect(new Set(TECHNIQUES.map((t) => t.id)).size).toBe(TECHNIQUES.length);
	});

	it('hay técnicas para cada lugar de la rutina y cada objetivo', () => {
		for (const kind of KINDS) expect(TECHNIQUES.some((t) => t.kind === kind)).toBe(true);
		for (const goal of GOALS)
			expect(TECHNIQUES.some((t) => t.kind === 'focus' && t.goals?.includes(goal))).toBe(true);
	});
});
