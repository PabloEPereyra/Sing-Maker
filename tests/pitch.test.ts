import { describe, expect, it } from 'vitest';
import { PitchStabilizer, yin } from '../src/lib/audio/pitch';

const SR = 48000;
const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** Voz sintética: fundamental + armónicos decrecientes. */
function voice(freq: number, n = 4096): Float32Array {
	const b = new Float32Array(n);
	for (let i = 0; i < n; i++) {
		const t = i / SR;
		b[i] =
			0.3 * Math.sin(2 * Math.PI * freq * t) +
			0.2 * Math.sin(2 * Math.PI * 2 * freq * t) +
			0.1 * Math.sin(2 * Math.PI * 3 * freq * t);
	}
	return b;
}

describe('yin', () => {
	it.each([45, 57, 64, 72, 81])('detecta MIDI %i con armónicos', (midi) => {
		const r = yin(voice(hz(midi)), SR);
		expect(r).not.toBeNull();
		expect(69 + 12 * Math.log2(r!.frequency / 440)).toBeCloseTo(midi, 0);
		expect(r!.clarity).toBeGreaterThan(0.8);
	});

	it('no devuelve tono con ruido', () => {
		const b = new Float32Array(4096).map(() => Math.random() * 0.4 - 0.2);
		const r = yin(b, SR);
		expect(r === null || r.clarity < 0.25).toBe(true);
	});
});

describe('PitchStabilizer', () => {
	const read = (midi: number, clarity = 0.7) => ({ frequency: hz(midi), clarity });

	it('ignora un salto de octava de un solo cuadro', () => {
		const s = new PitchStabilizer();
		let out: number | null = null;
		for (let t = 0; t < 5; t++) out = s.update(t * 16, read(60), true);
		out = s.update(80, read(72), true);
		expect(out).toBeCloseTo(60, 0);
		out = s.update(96, read(60), true);
		expect(out).toBeCloseTo(60, 0);
	});

	it('acepta un salto real si se sostiene', () => {
		const s = new PitchStabilizer();
		for (let t = 0; t < 5; t++) s.update(t * 16, read(60), true);
		let out: number | null = null;
		for (let t = 5; t < 10; t++) out = s.update(t * 16, read(67), true);
		expect(out).toBeCloseTo(67, 0);
	});

	it('sostiene la nota en un corte breve y suelta en silencio', () => {
		const s = new PitchStabilizer();
		for (let t = 0; t < 5; t++) s.update(t * 16, read(60), true);
		expect(s.update(100, null, true)).toBeCloseTo(60, 0);
		expect(s.update(600, null, true)).toBeNull();
	});
});
