import { describe, expect, it } from 'vitest';
import { parse, validate } from '../src/lib/music/parser';
import { generateSequence, measurePadding, rootsInRange } from '../src/lib/music/generate';
import { measureBeats, meterFamily, METERS, tickBeats } from '../src/lib/music/meter';
import { DRUM_PATTERNS, hitsAt, patternSteps } from '../src/lib/audio/drums';
import { midiToNote, noteToMidi } from '../src/lib/music/notes';
import { buildStars, isHit } from '../src/lib/game/scoring';
import raw from '../src/lib/data/exercises.json';

const SCALE = `@name: Escala mayor 2 notas
@description: Escala mayor | 1-2-1 | blancas
@bpm: 60
@syllable: mm

# Hold the root note
2 = !hint
2 =
2 +2
2 =
`;

describe('parser', () => {
	it('lee metadatos y notas', () => {
		const { meta, notes } = parse(SCALE);
		expect(meta.name).toBe('Escala mayor 2 notas');
		expect(meta.bpm).toBe(60);
		expect(meta.syllable).toBe('mm');
		expect(notes).toHaveLength(4);
		expect(notes[0].isHint).toBe(true);
		expect(notes[2].semitones).toBe(2);
		expect(validate(meta, notes)).toEqual([]);
	});

	it('acepta fracciones, silencios y varias notas por línea', () => {
		const { notes } = parse('1/2 +4 ~; .5 -3 .\n1 r');
		expect(notes.map((n) => n.duration)).toEqual([0.5, 0.5, 1]);
		expect(notes[0].legato).toBe(true);
		expect(notes[1].semitones).toBe(-3);
		expect(notes[1].staccato).toBe(true);
		expect(notes[2].isRest).toBe(true);
	});

	it('todo el catálogo se parsea y tiene notas cantables', () => {
		for (const e of raw) {
			const { notes } = parse(e.code);
			expect(
				notes.some((n) => !n.isRest && !n.isHint),
				e.name
			).toBe(true);
		}
	});
});

describe('notas', () => {
	it('convierte entre nombre y MIDI', () => {
		expect(noteToMidi('A4')).toBe(69);
		expect(noteToMidi('C4')).toBe(60);
		expect(midiToNote(61)).toBe('C#4');
	});
});

describe('generateSequence', () => {
	it('genera una repetición por raíz sin salirse del rango', () => {
		const { notes } = parse('1 =\n1 +4\n1 +7\n1 =');
		expect(rootsInRange(notes, 48, 60, 'asc')).toEqual([48, 49, 50, 51, 52, 53]);
		const seq = generateSequence(notes, { low: 48, high: 60, direction: 'asc', bpm: 60 });
		expect(seq.reps).toHaveLength(6);
		expect(Math.max(...seq.notes.map((n) => n.midi))).toBe(60);
		// 4 tiempos por repetición = 1 compás de 4/4: van pegadas, a 60 bpm
		expect(seq.reps[1].start).toBe(4);
		expect(seq.duration).toBe(6 * 4);
	});

	it('completa el compás si el patrón no lo llena', () => {
		const { notes } = parse('1 =\n1 +2\n1 =');
		expect(measurePadding(notes, 4)).toBe(1);
		expect(measurePadding(notes, 3)).toBe(0);
		const seq = generateSequence(notes, { low: 60, high: 64, direction: 'asc', bpm: 60 });
		expect(seq.reps.map((r) => r.start)).toEqual([0, 4, 8]);
	});

	it('en todo el catálogo cada repetición empieza en un compás (acento del metrónomo)', () => {
		for (const e of raw) {
			const { meta, notes } = parse(e.code);
			const seq = generateSequence(notes, {
				low: 48,
				high: 72,
				direction: meta.direction,
				bpm: 60,
				beatsPerMeasure: meta.beatsPerMeasure,
				subdivision: meta.subdivision
			});
			// En 6/8 el compás dura 3 negras (6 corcheas), no 6.
			const measure = measureBeats(meta);
			for (const r of seq.reps) {
				const beats = r.start; // a 60 bpm, 1 s = 1 tiempo
				expect(Math.abs(beats / measure - Math.round(beats / measure)), e.name).toBeLessThan(1e-9);
			}
		}
	});

	it('compases: 4/4 dura 4 negras con pulso de negra; 6/8, 3 negras con pulso de corchea', () => {
		expect(measureBeats(METERS['4/4'])).toBe(4);
		expect(tickBeats(METERS['4/4'])).toBe(1);
		expect(measureBeats(METERS['6/8'])).toBe(3);
		expect(tickBeats(METERS['6/8'])).toBe(0.5);
		expect(meterFamily({ beatsPerMeasure: 2, subdivision: 4 })).toBe('4/4');
		expect(meterFamily({ beatsPerMeasure: 6, subdivision: 8 })).toBe('6/8');
	});

	it('los patrones de batería miden compases enteros de su compás', () => {
		for (const pattern of DRUM_PATTERNS) {
			const steps = patternSteps(pattern);
			const perMeasure = METERS[pattern.meter].beatsPerMeasure * pattern.stepsPerTick;
			expect(steps % perMeasure, pattern.name).toBe(0);
			for (const track of Object.values(pattern.tracks)) expect(track!.length).toBe(steps);
		}
		// 6/8: bombo en el 1 y caja en la 4.ª corchea de cada compás.
		const six = DRUM_PATTERNS.find((p) => p.id === 'basic-68')!;
		expect(hitsAt(six, 0)).toContain('kick');
		expect(hitsAt(six, 6)).toContain('snare');
		expect(hitsAt(six, 18)).toContain('snare');
	});

	it('desciende si el ejercicio lo pide', () => {
		const { notes } = parse('1 =\n1 -2');
		expect(rootsInRange(notes, 50, 53, 'desc')).toEqual([53, 52]);
	});
});

describe('puntuación', () => {
	const { notes } = parse('2 = !hint\n1 =\n.5 +2 .');
	const seq = generateSequence(notes, { low: 60, high: 62, direction: 'asc', bpm: 60 });
	const stars = buildStars(seq.notes);

	it('las guías no dan estrellas; staccato da una sola', () => {
		expect(seq.notes[0].isHint).toBe(true);
		expect(stars.filter((s) => s.midi === 62)).toHaveLength(1);
		expect(stars.filter((s) => s.midi === 60).length).toBeGreaterThan(1);
	});

	it('acierta dentro de la tolerancia y la ventana', () => {
		const s = stars[0];
		expect(isHit(s, [{ time: s.time, midi: 60.4 }], 0.6)).toBe(true);
		expect(isHit(s, [{ time: s.time, midi: 61 }], 0.6)).toBe(false);
		expect(isHit(s, [{ time: s.time + 0.5, midi: 60 }], 0.6)).toBe(false);
		expect(isHit(s, [{ time: s.time, midi: null }], 0.6)).toBe(false);
	});
});
