import { describe, expect, it } from 'vitest';
import { fromEvents, place, toEvents, type RollEvent } from '../src/lib/music/roll';
import type { GeneratedNote } from '../src/lib/music/transcribe';

const melody: GeneratedNote[] = [
	{ d: 1, s: 0 },
	{ d: 1, s: 2 },
	{ d: 1, s: 4 },
	{ d: 1, s: 0 }
];

const overlaps = (list: GeneratedNote[]) => {
	const { events } = toEvents(list);
	return events.some((e, i) => i > 0 && e.start < events[i - 1].start + events[i - 1].d - 1e-9);
};

describe('piano roll: eventos', () => {
	it('ida y vuelta sin cambios', () => {
		const { events, total } = toEvents(melody);
		expect(fromEvents(events, total).notes).toEqual(melody);
	});

	it('los silencios pasan a ser huecos y se vuelven a rellenar', () => {
		const withRest: GeneratedNote[] = [
			{ d: 1, s: 0 },
			{ d: 1, s: 0, rest: true },
			{ d: 1, s: 3 },
			{ d: 2, s: 0, rest: true }
		];
		const { events, total } = toEvents(withRest);
		expect(events.map((e) => e.start)).toEqual([0, 2]);
		expect(total).toBe(5);
		expect(fromEvents(events, total).notes).toEqual(withRest);
	});

	it('un hueco largo se parte en silencios de hasta 4 tiempos', () => {
		const out = fromEvents([{ start: 9, d: 1, note: { d: 1, s: 0 }, from: 0 }], 10).notes;
		expect(out.map((n) => n.d)).toEqual([4, 4, 1, 1]);
		expect(out.filter((n) => n.rest)).toHaveLength(3);
	});
});

describe('piano roll: hacer lugar', () => {
	it('agregar una nota en el medio corre las siguientes', () => {
		const { events, total } = toEvents(melody);
		const added: RollEvent = { start: 1, d: 1, note: { d: 1, s: 7 }, from: -1 };
		const r = place(events, added, total);
		const out = fromEvents(r.events, r.total, added);
		expect(out.notes.map((n) => n.s)).toEqual([0, 7, 2, 4, 0]);
		expect(out.index).toBe(1);
		expect(overlaps(out.notes)).toBe(false);
		expect(r.total).toBe(5);
	});

	it('si cae sobre una nota la acorta en lugar de partirla', () => {
		const { events, total } = toEvents([
			{ d: 4, s: 0 },
			{ d: 1, s: 2 }
		]);
		const added: RollEvent = { start: 1, d: 1, note: { d: 1, s: 5 }, from: -1 };
		const r = place(events, added, total);
		expect(r.events.map((e) => [e.start, e.d])).toEqual([
			[0, 1],
			[1, 1],
			[4, 1]
		]);
	});

	it('usa los silencios antes de correr nada', () => {
		const list: GeneratedNote[] = [
			{ d: 1, s: 0 },
			{ d: 2, s: 0, rest: true },
			{ d: 1, s: 4 }
		];
		const { events, total } = toEvents(list);
		const added: RollEvent = { start: 1, d: 1, note: { d: 1, s: 2 }, from: -1 };
		const r = place(events, added, total);
		expect(r.events.map((e) => e.start)).toEqual([0, 1, 3]);
		expect(r.total).toBe(4);
	});

	it('mover una nota hacia otra desplaza a la otra y mantiene el orden sin superposiciones', () => {
		const { events, total } = toEvents(melody);
		const active = { ...events[0], start: 2 };
		const r = place(events.slice(1), active, total);
		const out = fromEvents(r.events, r.total, active).notes;
		expect(overlaps(out)).toBe(false);
		expect(out.filter((n) => !n.rest).map((n) => n.s)).toEqual([2, 0, 4, 0]);
	});

	it('alargar una nota empuja a las siguientes', () => {
		const { events, total } = toEvents(melody);
		const active = { ...events[0], d: 2.5 };
		const r = place(events.slice(1), active, total);
		expect(r.events.map((e) => e.start)).toEqual([0, 2.5, 3.5, 4.5]);
		expect(r.total).toBe(5.5);
	});

	it('nunca devuelve un total menor que el original', () => {
		const { events, total } = toEvents([...melody, { d: 4, s: 0, rest: true }]);
		const active = { ...events[0], d: 0.5 };
		expect(place(events.slice(1), active, total).total).toBe(8);
	});
});
