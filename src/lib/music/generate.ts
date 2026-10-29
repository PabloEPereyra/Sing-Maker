// Expande un ejercicio relativo sobre el rango de la voz: una repetición por cada raíz.
// Basado en generateFromCode de vocalizator/src/scripts/exercises.ts.
import { midiToFreq, midiToNote } from './notes';
import type { Direction, ParsedNote } from './parser';
import { measureBeats } from './meter';

export interface TimedNote {
	id: number;
	midi: number;
	freq: number;
	/** Segundos desde el inicio del ejercicio. */
	start: number;
	duration: number;
	isRest: boolean;
	isHint: boolean;
	legato: boolean;
	staccato: boolean;
	/** Índice de la repetición (raíz) a la que pertenece. */
	rep: number;
	syllable?: string;
}

export interface Repetition {
	rootMidi: number;
	root: string;
	start: number;
	end: number;
}

export interface Sequence {
	notes: TimedNote[];
	reps: Repetition[];
	duration: number;
}

export interface GenerateOptions {
	/** Rango cómodo de la voz (MIDI). */
	low: number;
	high: number;
	direction: Direction;
	bpm: number;
	/** Pulsos por compás: cada repetición empieza al comienzo de un compás (default 4). */
	beatsPerMeasure?: number;
	/** Figura del pulso (4 negra, 8 corchea): en 6/8 un compás dura 3 negras. */
	subdivision?: number;
	/** Tope de repeticiones (para ejercicios largos). */
	maxReps?: number;
	/** Solo esta cantidad de repeticiones, repartidas a lo largo del rango (graves a agudas). */
	spread?: number;
}

/** Raíces en las que el patrón entero cabe en el rango. */
export function rootsInRange(
	notes: ParsedNote[],
	low: number,
	high: number,
	direction: Direction
): number[] {
	const offsets = notes.filter((n) => !n.isRest).map((n) => n.semitones);
	const minOffset = Math.min(0, ...offsets);
	const maxOffset = Math.max(0, ...offsets);
	const roots: number[] = [];
	for (let root = low - minOffset; root + maxOffset <= high; root++) roots.push(root);
	return direction === 'desc' ? roots.reverse() : roots;
}

/** Tiempos (negras) de silencio que faltan para que la repetición complete el compás. */
export function measurePadding(notes: ParsedNote[], measureLength: number): number {
	const beats = notes.reduce((sum, n) => sum + n.duration, 0);
	const rest = beats % measureLength;
	return rest < 1e-6 || measureLength - rest < 1e-6 ? 0 : measureLength - rest;
}

export function generateSequence(notes: ParsedNote[], opts: GenerateOptions): Sequence {
	const beat = 60 / opts.bpm;
	// Como en vocalizator, las repeticiones van pegadas; solo se completa el compás si el patrón
	// no lo llena, así el acento del metrónomo cae siempre en el comienzo de cada repetición.
	const padBeats = measurePadding(
		notes,
		measureBeats({ beatsPerMeasure: opts.beatsPerMeasure ?? 4, subdivision: opts.subdivision ?? 4 })
	);
	let roots = rootsInRange(notes, opts.low, opts.high, opts.direction);
	if (opts.maxReps && roots.length > opts.maxReps) roots = roots.slice(0, opts.maxReps);
	if (opts.spread && roots.length > opts.spread) {
		const last = roots.length - 1;
		const k = opts.spread;
		roots = Array.from(
			{ length: k },
			(_, i) => roots[k === 1 ? 0 : Math.round((i * last) / (k - 1))]
		);
	}

	const out: TimedNote[] = [];
	const reps: Repetition[] = [];
	// Se acumulan tiempos (beats) y se convierte a segundos al final de cada suma, para que
	// no se acumule error de redondeo a lo largo de muchas repeticiones.
	let beats = 0;
	let id = 0;

	roots.forEach((rootMidi, rep) => {
		const repStart = beats * beat;
		for (const n of notes) {
			const midi = n.isRest ? 0 : rootMidi + n.semitones;
			out.push({
				id: id++,
				midi,
				freq: n.isRest ? 0 : midiToFreq(midi),
				start: beats * beat,
				duration: n.duration * beat,
				isRest: n.isRest,
				isHint: n.isHint,
				legato: n.legato,
				staccato: n.staccato,
				rep,
				syllable: n.syllable
			});
			beats += n.duration;
		}
		reps.push({ rootMidi, root: midiToNote(rootMidi), start: repStart, end: beats * beat });
		beats += padBeats;
	});

	return { notes: out, reps, duration: Math.max(0, (beats - padBeats) * beat) };
}
