import { describe, expect, it } from 'vitest';
import { OctaveWatch, type OctaveTarget } from '../src/lib/game/octave';

const DT = 1 / 30;
const TOL = 0.75;

const note = (id: number, midi: number, duration = 0.5): OctaveTarget => ({ id, midi, duration });

/** Canta `voice` durante toda la nota; devuelve cuántos avisos salieron. */
function sing(w: OctaveWatch, n: OctaveTarget, voice: number | null, t0: number): number {
	let warns = 0;
	for (let t = 0; t < n.duration; t += DT) if (w.feed(n, voice, t0 + t, TOL)) warns++;
	return warns;
}

describe('OctaveWatch', () => {
	it('avisa a la tercera nota seguida cantada una octava abajo', () => {
		const w = new OctaveWatch();
		expect(sing(w, note(1, 60), 48, 0)).toBe(0);
		expect(sing(w, note(2, 62), 50, 1)).toBe(0);
		expect(sing(w, note(3, 64), 52, 2)).toBe(1);
	});

	it('también cuenta una octava arriba y notas algo desafinadas', () => {
		const w = new OctaveWatch();
		sing(w, note(1, 60), 72.3, 0);
		sing(w, note(2, 62), 73.8, 1);
		expect(sing(w, note(3, 64), 76.2, 2)).toBe(1);
	});

	it('no avisa si una nota se canta bien en el medio', () => {
		const w = new OctaveWatch();
		sing(w, note(1, 60), 48, 0);
		sing(w, note(2, 62), 62, 1);
		expect(sing(w, note(3, 64), 52, 2)).toBe(0);
	});

	it('no avisa con un error que no es de octava', () => {
		const w = new OctaveWatch();
		sing(w, note(1, 60), 55, 0);
		sing(w, note(2, 62), 57, 1);
		expect(sing(w, note(3, 64), 59, 2)).toBe(0);
	});

	it('el silencio corta la racha', () => {
		const w = new OctaveWatch();
		sing(w, note(1, 60), 48, 0);
		sing(w, note(2, 62), null, 1);
		expect(sing(w, note(3, 64), 52, 2)).toBe(0);
	});

	it('una nota corta cantada un instante no alcanza', () => {
		const w = new OctaveWatch();
		expect(w.feed(note(1, 60, 1), 48, 0, TOL)).toBe(false);
		expect(w.feed(note(1, 60, 1), 48, 0.05, TOL)).toBe(false);
		expect(w.feed(note(1, 60, 1), 60, 0.1, TOL)).toBe(false);
	});

	it('no repite el aviso hasta pasado el tiempo de espera, y luego vuelve a avisar', () => {
		const w = new OctaveWatch();
		let warns = 0;
		for (let i = 0; i < 6; i++) warns += sing(w, note(i + 1, 60 + i, 0.5), 48 + i, i * 0.6);
		expect(warns).toBe(1);
		for (let i = 6; i < 20; i++) warns += sing(w, note(i + 1, 60 + i, 0.5), 48 + i, i * 0.6);
		expect(warns).toBe(2);
	});

	it('con pocos cuadros por segundo cuenta el tiempo real de la nota', () => {
		const w = new OctaveWatch();
		// 8 cuadros por segundo: cada nota de medio segundo trae solo 4 cuadros.
		let warns = 0;
		for (let i = 0; i < 3; i++)
			for (let f = 0; f < 4; f++)
				if (w.feed(note(i + 1, 60 + i, 0.5), 48 + i, i + f * 0.125, TOL)) warns++;
		expect(warns).toBe(1);
	});

	it('reset deja todo en cero', () => {
		const w = new OctaveWatch();
		sing(w, note(1, 60), 48, 0);
		sing(w, note(2, 62), 50, 1);
		w.reset();
		expect(sing(w, note(3, 64), 52, 2)).toBe(0);
	});
});
