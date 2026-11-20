// Entrenador sin IA: qué dice según el resumen y qué ejercicio recomienda.
import { describe, expect, it } from 'vitest';
import { localCoach, REPEAT_FROM, type LocalSummary } from '../src/lib/coach/local';
import { LEVEL_UP_PERCENT, nextExercise } from '../src/lib/coach/rules';

const list = (notes: string[]) => notes.join(' y ');
const base: LocalSummary = {
	percent: 70,
	trend: 'steady',
	tendency: 'none',
	silentMissPercent: 0,
	lowPercent: 70,
	highPercent: 70,
	weakNotes: []
};
const here = { id: 'e5', level: '2', category: 'Afinación', order: 5 };
const catalog = [
	{ id: 'e2', name: 'Dos', level: '1', category: 'Afinación', order: 2 },
	{ id: 'e4', name: 'Cuatro', level: '1', category: 'Calentamiento', order: 4 },
	{ id: 'e3', name: 'Tres', level: '1', category: 'Afinación', order: 3 },
	{ id: 'e6', name: 'Seis', level: '2', category: 'Afinación', order: 6 },
	{ id: 'e9', name: 'Nueve', level: '3', category: 'Afinación', order: 9 }
];
const keys = (s: Partial<LocalSummary>, desynced = false) =>
	localCoach({ ...base, ...s }, here, catalog, { desynced, listNotes: list }).lines.map(
		(l) => l.key
	);

describe('ejercicio siguiente', () => {
	it('al subir de nivel, el más cercano de los siguientes de la misma categoría', () => {
		expect(nextExercise(here, LEVEL_UP_PERCENT, catalog)?.id).toBe('e6');
	});

	it('si costó, el más cercano de los anteriores de la misma categoría', () => {
		expect(nextExercise(here, 30, catalog)?.id).toBe('e3');
	});

	it('un ejercicio propio (sin lugar en la lista) se compara por nivel', () => {
		const mine = { id: 'mio', level: '2', category: 'Afinación' };
		expect(nextExercise(mine, 90, catalog)?.level).not.toBe('1');
		expect(Number(nextExercise(mine, 20, catalog)?.level)).toBeLessThanOrEqual(2);
	});

	it('sin candidatos que encajen no recomienda nada', () => {
		expect(nextExercise({ ...here, order: 99 }, 95, catalog)).toBeUndefined();
	});
});

describe('devolución sin IA', () => {
	it('muy bien: felicita, sube de nivel y propone uno más difícil', () => {
		const r = localCoach({ ...base, percent: 92 }, here, catalog, { listNotes: list });
		expect(r.levelUp).toBe(true);
		expect(r.lines).toEqual([
			{ key: 'coachLocal.great', params: { pct: 92 } },
			{ key: 'coachLocal.nextUp' }
		]);
		expect(r.next?.id).toBe('e6');
	});

	it('a medias: repetir el mismo, sin cambiar de ejercicio', () => {
		const r = localCoach({ ...base, percent: REPEAT_FROM }, here, catalog, { listNotes: list });
		expect(r.next).toBeUndefined();
		expect(r.lines.at(-1)).toEqual({ key: 'coachLocal.repeat' });
	});

	it('costó mucho: propone uno más fácil', () => {
		const r = localCoach({ ...base, percent: 35 }, here, catalog, { listNotes: list });
		expect(r.next?.id).toBe('e3');
		expect(r.lines.at(-1)).toEqual({ key: 'coachLocal.nextEasier' });
	});

	it('nombra las notas que fallaron y hacia dónde se fue la voz', () => {
		const r = localCoach(
			{
				...base,
				tendency: 'low',
				weakNotes: [
					{ note: 'Mi4', percent: 30 },
					{ note: 'Fa4', percent: 40 },
					{ note: 'Sol4', percent: 50 }
				]
			},
			here,
			catalog,
			{ listNotes: list }
		);
		expect(r.lines[1]).toEqual({
			key: 'coachLocal.notesLow',
			params: { notes: 'Mi4 y Fa4', n: 2 }
		});
	});

	it('dice una sola cosa para trabajar, la más importante primero', () => {
		const weak = { tendency: 'high' as const, weakNotes: [{ note: 'La4', percent: 20 }] };
		expect(keys({ ...weak, silentMissPercent: 60 }, true)).toContain('coachLocal.desynced');
		expect(keys({ ...weak, silentMissPercent: 60 })).toContain('coachLocal.silent');
		expect(keys(weak)).toContain('coachLocal.notesHigh');
		expect(keys({ tendency: 'low' })).toContain('coachLocal.low');
		expect(keys({ lowPercent: 90, highPercent: 50 })).toContain('coachLocal.highHarder');
		expect(keys({ lowPercent: 40, highPercent: 80 })).toContain('coachLocal.lowHarder');
		expect(
			keys(weak).filter((k) => k !== 'coachLocal.result' && k !== 'coachLocal.repeat')
		).toHaveLength(1);
	});

	it('la primera frase sigue la tendencia de las repeticiones', () => {
		expect(keys({ trend: 'up' })[0]).toBe('coachLocal.improving');
		expect(keys({ trend: 'down' })[0]).toBe('coachLocal.tired');
		expect(keys({})[0]).toBe('coachLocal.result');
	});
});
