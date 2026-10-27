// De una voz grabada (tono por cuadro) a un ejercicio: separa las notas, estima el tempo, cuantiza
// las duraciones a una grilla de corcheas/semicorcheas, completa el compás y agrega la nota guía.
// La gente no canta a tempo perfecto: todo apunta a que el resultado sea simple y entre en compás,
// para que haya que corregir lo menos posible en el piano roll.
import type { GeneratedExercise } from '../ai/exercise';

export type GeneratedNote = GeneratedExercise['notes'][number];

export interface PitchFrame {
	/** Segundos desde el comienzo de la grabación. */
	time: number;
	/** Tono (MIDI fraccionario) o null si no hay voz. */
	midi: number | null;
	/**
	 * Volumen (RMS). Sirve para separar notas repetidas: entre "do" y "do" el tono no cambia y el
	 * detector sostiene la nota en los cortes breves, pero la consonante hace bajar el volumen.
	 */
	rms?: number;
}

export interface RawNote {
	start: number;
	/** Fin del sonido (sin contar el silencio que sigue). */
	end: number;
	/** Tono redondeado al semitono (mediana de sus cuadros). */
	midi: number;
	/** Empezó con un ataque nuevo (consonante): no se une con la anterior aunque sea el mismo tono. */
	attack?: boolean;
}

/** Cambio de tono (semitonos) que abre una nota nueva si se sostiene. */
const CHANGE_SEMI = 0.7;
/** Tiempo que tiene que sostenerse el cambio de tono para cortar la nota. */
const CHANGE_HOLD_SEC = 0.06;
/** Silencio que corta una nota. */
const GAP_SEC = 0.08;
/** Notas más cortas que esto son ruido o deslizamientos (se descartan). */
const MIN_NOTE_SEC = 0.09;
/** Valle de volumen: por debajo de esta parte del pico de la nota. */
const VALLEY = 0.5;
/** Ataque nuevo: el volumen sube este factor desde el fondo del valle. */
const RISE = 1.8;

function median(values: number[]): number {
	const s = [...values].sort((a, b) => a - b);
	return s[Math.floor(s.length / 2)];
}

/** Separa la grabación en notas: cambios de tono sostenidos o silencios abren una nota nueva. */
export function segmentNotes(frames: PitchFrame[]): RawNote[] {
	const notes: RawNote[] = [];
	let cur: { start: number; end: number; values: number[]; attack?: boolean } | null = null;
	let pending: { start: number; values: number[] } | null = null;
	let silenceSince: number | null = null;
	// Volumen dentro de la nota actual: pico y valle (para detectar un ataque nuevo en el mismo tono).
	let peak = 0;
	let valleyMin: number | null = null;

	const close = () => {
		if (cur && cur.end - cur.start >= MIN_NOTE_SEC)
			notes.push({
				start: cur.start,
				end: cur.end,
				midi: Math.round(median(cur.values)),
				attack: cur.attack
			});
		cur = null;
		pending = null;
	};

	for (const f of frames) {
		if (f.midi === null) {
			silenceSince ??= f.time;
			if (cur && f.time - silenceSince >= GAP_SEC) close();
			continue;
		}
		silenceSince = null;
		if (!cur) {
			cur = { start: f.time, end: f.time, values: [f.midi] };
			peak = f.rms ?? 0;
			valleyMin = null;
			continue;
		}
		if (f.rms !== undefined) {
			if (f.rms < peak * VALLEY) valleyMin = Math.min(valleyMin ?? f.rms, f.rms);
			else if (valleyMin !== null && f.rms > valleyMin * RISE) {
				// Ataque nuevo (consonante y vocal): nota nueva aunque el tono sea el mismo.
				cur.end = f.time;
				close();
				cur = { start: f.time, end: f.time, values: [f.midi], attack: true };
				peak = f.rms;
				valleyMin = null;
				continue;
			}
			peak = Math.max(peak, f.rms);
		}
		const center = median(cur.values.slice(-12));
		if (Math.abs(f.midi - center) >= CHANGE_SEMI) {
			// Posible nota nueva: se confirma si el cambio se sostiene.
			pending ??= { start: f.time, values: [] };
			pending.values.push(f.midi);
			if (f.time - pending.start >= CHANGE_HOLD_SEC) {
				// La nota nueva empieza donde empezó el cambio, pero su tono se toma desde donde la voz
				// se asentó (el deslizamiento de entrada no cuenta).
				const next = pending;
				cur.end = next.start;
				close();
				cur = { start: next.start, end: f.time, values: [f.midi] };
				peak = f.rms ?? 0;
				valleyMin = null;
			}
		} else {
			pending = null;
			cur.values.push(f.midi);
			cur.end = f.time;
		}
	}
	close();
	return mergeRepeats(notes);
}

/** Une una nota con la siguiente si son el mismo semitono separados por un corte mínimo. */
function mergeRepeats(notes: RawNote[]): RawNote[] {
	const out: RawNote[] = [];
	for (const n of notes) {
		const prev = out.at(-1);
		if (prev && !n.attack && prev.midi === n.midi && n.start - prev.end < 0.05) prev.end = n.end;
		else out.push({ ...n });
	}
	return out;
}

export interface QuantizeOptions {
	/** Tiempos por compás (por defecto se elige 4, o 3 si encaja mejor). */
	beatsPerMeasure?: number;
}

export interface Quantized {
	bpm: number;
	beatsPerMeasure: number;
	/** Primera nota cantada (MIDI): la tonalidad en que se cantó. */
	root: number;
	/** Notas en tiempos, relativas a la primera nota cantada, con la guía al comienzo. */
	notes: GeneratedNote[];
}

const roundTo = (x: number, step: number) => Math.round(x / step) * step;

/**
 * Estima el tempo: el intervalo típico entre notas (mediana) es una negra; si da un tempo muy rápido
 * o muy lento se toma como corchea o blanca, para que quede entre 50 y 140 bpm.
 */
export function estimateTempo(notes: RawNote[]): { bpm: number; beatSec: number } {
	const iois = notes.slice(0, -1).map((n, i) => notes[i + 1].start - n.start);
	let beatSec = iois.length ? median(iois) : notes.length ? notes[0].end - notes[0].start : 0.75;
	beatSec = Math.max(0.1, beatSec);
	while (60 / beatSec > 150) beatSec *= 2;
	while (60 / beatSec < 60) beatSec /= 2;
	// Tempo redondeado a 5 y la duración del tiempo recalculada con ese valor.
	const bpm = Math.max(60, Math.min(150, roundTo(60 / beatSec, 5)));
	return { bpm, beatSec: 60 / bpm };
}

/** Cuantiza las notas a la grilla y arma el patrón relativo con la nota guía. */
export function quantize(notes: RawNote[], opts: QuantizeOptions = {}): Quantized | null {
	if (notes.length < 2) return null;
	const { bpm, beatSec } = estimateTempo(notes);
	// Grilla: corcheas; semicorcheas solo si hay notas realmente cortas.
	const shortest = Math.min(...notes.slice(0, -1).map((n, i) => notes[i + 1].start - n.start));
	const grid = shortest / beatSec < 0.4 ? 0.25 : 0.5;
	const root = notes[0].midi;

	const body: GeneratedNote[] = [];
	notes.forEach((n, i) => {
		const s = n.midi - root;
		const sound = (n.end - n.start) / beatSec;
		if (i === notes.length - 1) {
			// La última nota se sostiene: al menos un tiempo.
			body.push({ d: Math.max(1, roundTo(sound, grid)), s });
			return;
		}
		const ioi = Math.max(grid, roundTo((notes[i + 1].start - n.start) / beatSec, grid));
		const d = Math.min(ioi, Math.max(grid, roundTo(sound, grid)));
		// Un silencio de al menos media grilla entre notas queda escrito; si no, la nota llena el hueco.
		if (ioi - d >= grid && ioi - d >= 0.5) {
			body.push({ d, s });
			body.push({ d: ioi - d, s: 0, rest: true });
		} else body.push({ d: ioi, s });
	});

	const total = body.reduce((a, n) => a + n.d, 0);
	// Por ahora todo en 4/4 (los patrones de batería son 4/4 y 6/8).
	const beatsPerMeasure = opts.beatsPerMeasure ?? 4;
	// Completa el compás alargando la última nota (como en los ejercicios del catálogo), hasta 4 tiempos.
	const missing = (beatsPerMeasure - (total % beatsPerMeasure)) % beatsPerMeasure;
	const last = body[body.length - 1];
	if (missing > 0 && last.d + missing <= 4) last.d += missing;
	// Las duraciones del formato llegan hasta 4 tiempos: se parten las más largas.
	const split: GeneratedNote[] = [];
	for (const n of body) {
		let left = n.d;
		while (left > 4) {
			split.push({ ...n, d: 4 });
			left -= 4;
		}
		split.push({ ...n, d: left });
	}
	const hint: GeneratedNote = { d: beatsPerMeasure === 3 ? 3 : 2, s: 0, hint: true };
	return { bpm, beatsPerMeasure, root, notes: [hint, ...split] };
}

/**
 * Atajo: de los cuadros de tono al ejercicio, con la nota en que se empezó a cantar (o null si no hay
 * al menos dos notas).
 */
export function transcribe(
	frames: PitchFrame[],
	name: string,
	description: string
): { exercise: GeneratedExercise; root: number } | null {
	const q = quantize(segmentNotes(frames));
	if (!q) return null;
	return {
		root: q.root,
		exercise: {
			name,
			description,
			bpm: q.bpm,
			beatsPerMeasure: q.beatsPerMeasure,
			direction: 'asc',
			syllable: '',
			notes: q.notes
		}
	};
}
