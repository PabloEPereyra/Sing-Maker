// Edición libre de un patrón en el piano roll. La melodía se guarda como una lista de notas una
// detrás de otra (los silencios son notas con `rest`); para editarla se pasa a eventos con tiempo
// absoluto, donde los silencios son los huecos entre notas, y se vuelve a la lista al terminar.
// Las notas nunca quedan superpuestas: al poner una, las demás le hacen lugar.
import type { GeneratedNote } from './transcribe';

/** Resolución de la edición, en negras (semicorchea). */
export const GRID = 0.25;
/** Duración máxima de una nota o silencio, en negras (la que acepta el validador). */
export const MAX_DURATION = 4;

export interface RollEvent {
	start: number;
	d: number;
	note: GeneratedNote;
	/** Posición de la nota en la lista original (para volver a encontrarla). */
	from: number;
}

const EPS = 1e-6;

/** Notas con altura -> eventos con tiempo absoluto, más el largo total (los silencios finales cuentan). */
export function toEvents(notes: GeneratedNote[]): { events: RollEvent[]; total: number } {
	const events: RollEvent[] = [];
	let t = 0;
	notes.forEach((note, from) => {
		if (!note.rest) events.push({ start: t, d: note.d, note, from });
		t += note.d;
	});
	return { events, total: t };
}

/**
 * Eventos -> lista de notas; los huecos se rellenan con silencios (de hasta 4 tiempos cada uno).
 * `index` es la posición en la lista de `mark` (o -1).
 */
export function fromEvents(
	events: RollEvent[],
	total: number,
	mark?: RollEvent
): { notes: GeneratedNote[]; index: number } {
	const out: GeneratedNote[] = [];
	let index = -1;
	const gap = (from: number, to: number) => {
		for (let left = to - from; left > EPS;) {
			const d = Math.min(MAX_DURATION, left);
			out.push({ d, s: 0, rest: true });
			left -= d;
		}
	};
	let t = 0;
	for (const e of [...events].sort((a, b) => a.start - b.start)) {
		gap(t, e.start);
		if (e === mark) index = out.length;
		out.push({ ...e.note, d: e.d });
		t = e.start + e.d;
	}
	gap(t, total);
	return { notes: out, index };
}

/**
 * Pone `active` en su lugar y acomoda el resto: una nota que lo pisa por la izquierda se acorta, y
 * las que quedan debajo o a su derecha se corren hacia adelante lo justo para no superponerse.
 * Devuelve los eventos ordenados, el índice de `active` y el largo total (nunca menor que `total`).
 */
export function place(
	others: RollEvent[],
	active: RollEvent,
	total: number
): { events: RollEvent[]; index: number; total: number } {
	const rest = others.map((e) => ({ ...e })).sort((a, b) => a.start - b.start);
	for (const e of rest) {
		if (e.start < active.start - EPS && e.start + e.d > active.start + EPS)
			e.d = active.start - e.start;
	}
	let cursor = active.start + active.d;
	for (const e of rest) {
		if (e.start < active.start - EPS) continue;
		if (e.start < cursor - EPS) e.start = cursor;
		cursor = e.start + e.d;
	}
	const events = [...rest, active].sort((a, b) => a.start - b.start);
	const end = Math.max(...events.map((e) => e.start + e.d));
	return { events, index: events.indexOf(active), total: Math.max(total, end) };
}

export const snap = (x: number): number => Math.round(x / GRID) * GRID;
export const clampDuration = (d: number): number => Math.max(GRID, Math.min(MAX_DURATION, snap(d)));

/** Largo (en tiempos) hasta el final de la última nota o silencio: el que se conserva al editar. */
export function totalOf(notes: GeneratedNote[]): number {
	return notes.reduce((a, n) => a + n.d, 0);
}
