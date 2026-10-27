import { describe, expect, it } from 'vitest';
import { toCode, validateGenerated } from '../src/lib/ai/exercise';
import { parse } from '../src/lib/music/parser';
import { quantize, segmentNotes, transcribe, type PitchFrame } from '../src/lib/music/transcribe';

/** Números pseudoaleatorios reproducibles. */
function rng(seed: number) {
	return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31) * 2 - 1;
}

/**
 * Voz simulada a 60 cuadros/s: cada nota con una entrada deslizada desde abajo, vibrato, cortes
 * sueltos y duraciones desparejas (como canta alguien sin metrónomo).
 */
function hum(
	notes: { midi: number | null; sec: number }[],
	{ jitter = 0.12, seed = 7 } = {}
): PitchFrame[] {
	const rand = rng(seed);
	const frames: PitchFrame[] = [];
	let t = 0.3; // silencio inicial
	for (let i = 0; i < 18; i++) frames.push({ time: i / 60, midi: null });
	for (const n of notes) {
		const len = n.sec * (1 + rand() * jitter);
		for (let x = 0; x < len; x += 1 / 60) {
			if (n.midi === null || rand() > 0.97) {
				frames.push({ time: t + x, midi: null });
				continue;
			}
			const scoop = x < 0.05 ? -1 + x / 0.05 : 0;
			frames.push({
				time: t + x,
				midi: n.midi + scoop + 0.25 * Math.sin(2 * Math.PI * 5.5 * (t + x)) + rand() * 0.1
			});
		}
		t += len;
	}
	for (let i = 0; i < 18; i++) frames.push({ time: t + i / 60, midi: null });
	return frames;
}

describe('de la voz al ejercicio', () => {
	it('separa las notas de un arpegio cantado desparejo', () => {
		const frames = hum([
			{ midi: 60, sec: 0.6 },
			{ midi: 64, sec: 0.6 },
			{ midi: 67, sec: 0.6 },
			{ midi: 64, sec: 0.6 },
			{ midi: 60, sec: 1.4 }
		]);
		expect(segmentNotes(frames).map((n) => n.midi)).toEqual([60, 64, 67, 64, 60]);
	});

	it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])(
		'cuantiza a negras y completa el compás (variante %i)',
		(seed) => {
			const frames = hum(
				[
					{ midi: 60, sec: 0.6 },
					{ midi: 64, sec: 0.6 },
					{ midi: 67, sec: 0.6 },
					{ midi: 64, sec: 0.6 },
					{ midi: 60, sec: 1.4 }
				],
				{ seed }
			);
			const q = quantize(segmentNotes(frames))!;
			expect(q.bpm).toBeGreaterThanOrEqual(90);
			expect(q.bpm).toBeLessThanOrEqual(110);
			expect(q.notes[0]).toEqual({ d: 2, s: 0, hint: true });
			const sung = q.notes.slice(1);
			expect(sung.map((n) => n.s)).toEqual([0, 4, 7, 4, 0]);
			expect(sung.slice(0, 4).map((n) => n.d)).toEqual([1, 1, 1, 1]);
			// 4 negras + la última sostenida hasta completar el segundo compás.
			expect(sung.reduce((a, n) => a + n.d, 0) % 4).toBe(0);
		}
	);

	it('escribe los silencios entre notas', () => {
		const frames = hum(
			[
				{ midi: 62, sec: 0.3 },
				{ midi: null, sec: 0.3 },
				{ midi: 69, sec: 0.3 },
				{ midi: null, sec: 0.3 },
				{ midi: 62, sec: 1.2 }
			],
			{ jitter: 0.05 }
		);
		const sung = quantize(segmentNotes(frames))!.notes.slice(1);
		expect(sung.filter((n) => n.rest).length).toBe(2);
		expect(sung.filter((n) => !n.rest).map((n) => n.s)).toEqual([0, 7, 0]);
	});

	it('el resultado es un ejercicio válido para la app', () => {
		const frames = hum(
			[60, 62, 64, 65, 67, 65, 64, 62]
				.map((midi) => ({ midi, sec: 0.32 }))
				.concat([{ midi: 60, sec: 1.1 }]),
			{ seed: 3 }
		);
		const { exercise: ex, root } = transcribe(frames, 'Mi melodía', 'Grabada')!;
		expect(root).toBe(60);
		expect(validateGenerated(ex)).toEqual([]);
		const { notes } = parse(toCode(ex));
		expect(notes.filter((n) => !n.isHint).map((n) => n.semitones)).toEqual([
			0, 2, 4, 5, 7, 5, 4, 2, 0
		]);
	});

	it.each([1, 2, 3, 4, 5])(
		'separa notas repetidas por el ataque de la consonante (do-do-sol-sol-la-la-sol, variante %i)',
		(seed) => {
			// Como el detector real: sostiene el tono en los cortes breves, así que entre "do" y "do"
			// el tono no se corta; lo que marca la nota nueva es la caída de volumen de la consonante.
			const rand = rng(seed);
			const frames: PitchFrame[] = [];
			let t = 0.3;
			const melody = [60, 60, 67, 67, 69, 69, 67];
			melody.forEach((midi, i) => {
				const len = (i === melody.length - 1 ? 1.2 : 0.5) * (1 + rand() * 0.1);
				for (let x = 0; x < len; x += 1 / 60) {
					const consonant = x < 0.06; // "d", "s", "l": el volumen cae unos 60 ms
					const rms = (consonant ? 0.012 : 0.08) * (1 + rand() * 0.15);
					const prev = melody[i - 1] ?? midi;
					const pitch = consonant && x < 0.03 ? prev : midi; // el detector arrastra la anterior
					frames.push({
						time: t + x,
						midi: pitch + 0.2 * Math.sin(2 * Math.PI * 5.5 * (t + x)) + rand() * 0.1,
						rms
					});
				}
				t += len;
			});
			for (let i = 0; i < 12; i++) frames.push({ time: t + i / 60, midi: null, rms: 0.001 });

			const result = transcribe(frames, 'x', '')!;
			expect(result.root).toBe(60);
			const sung = result.exercise.notes.filter((n) => !n.hint && !n.rest);
			expect(sung.map((n) => n.s)).toEqual([0, 0, 7, 7, 9, 9, 7]);
			expect(sung.slice(0, 6).every((n) => n.d === sung[0].d)).toBe(true);
		}
	);

	it('con una sola nota no hay ejercicio', () => {
		expect(transcribe(hum([{ midi: 60, sec: 1 }]), 'x', '')).toBeNull();
	});
});
