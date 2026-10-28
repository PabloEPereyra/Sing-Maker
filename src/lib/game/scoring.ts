// Lógica pura de puntuación (sin canvas ni audio), para poder probarla con vitest.
import type { TimedNote } from '$lib/music/generate';
import type { CollectibleState } from './theme';

export interface Star {
	noteId: number;
	rep: number;
	/** Segundos desde el inicio del ejercicio. */
	time: number;
	midi: number;
	state: CollectibleState;
	/** Momento (tiempo del ejercicio) en que cambió de estado. */
	changedAt: number;
}

export interface PitchSample {
	time: number;
	/** null = silencio. */
	midi: number | null;
}

/** Separación aproximada entre estrellas dentro de una nota larga. */
const STAR_SPACING_SEC = 0.28;
/** Ventana alrededor de la estrella en la que se acepta el tono. */
export const HIT_WINDOW_SEC = 0.09;
/** Hueco máximo entre dos lecturas para interpolar el acierto. */
const MAX_SAMPLE_GAP_SEC = 0.6;

/** Una o más estrellas por nota cantable (las guías y silencios no tienen). */
export function buildStars(notes: TimedNote[]): Star[] {
	const stars: Star[] = [];
	for (const n of notes) {
		if (n.isRest || n.isHint) continue;
		const count = n.staccato ? 1 : Math.max(1, Math.round(n.duration / STAR_SPACING_SEC));
		for (let i = 0; i < count; i++) {
			stars.push({
				noteId: n.id,
				rep: n.rep,
				time: n.start + (n.duration * (i + 0.5)) / count,
				midi: n.midi,
				state: 'idle',
				changedAt: 0
			});
		}
	}
	return stars;
}

/** ¿Algún tono cantado cerca del instante de la estrella está dentro de la tolerancia (semitonos)? */
export function isHit(star: Star, history: PitchSample[], tolerance: number): boolean {
	const near = (s: PitchSample | undefined) =>
		s !== undefined && s.midi !== null && Math.abs(s.midi - star.midi) <= tolerance;
	let before: PitchSample | undefined;
	let after: PitchSample | undefined;
	for (let i = history.length - 1; i >= 0; i--) {
		const s = history[i];
		if (s.time > star.time) after = s;
		else if (!before) before = s;
		if (s.time < star.time - HIT_WINDOW_SEC) break;
		if (s.time <= star.time + HIT_WINDOW_SEC && near(s)) return true;
	}
	// Si el navegador perdió cuadros (pestaña lenta), se usan las lecturas vecinas a la estrella.
	if (before && after && after.time - before.time <= MAX_SAMPLE_GAP_SEC) {
		return near(before) || near(after);
	}
	return false;
}

export interface RepScore {
	rep: number;
	collected: number;
	total: number;
}

export function scoreByRep(stars: Star[]): RepScore[] {
	const reps = new Map<number, RepScore>();
	for (const s of stars) {
		const r = reps.get(s.rep) ?? { rep: s.rep, collected: 0, total: 0 };
		r.total++;
		if (s.state === 'collected') r.collected++;
		reps.set(s.rep, r);
	}
	return [...reps.values()].sort((a, b) => a.rep - b.rep);
}

export interface ShiftFit {
	/** Corrimiento (s) que se le suma al tiempo de las lecturas para que calcen mejor con las notas. */
	shift: number;
	/** Estrellas que se recogerían con ese corrimiento. */
	hits: number;
	/** Estrellas que se recogen sin corrimiento. */
	base: number;
}

const SHIFT_MIN_SEC = -0.3;
const SHIFT_MAX_SEC = 0.4;
const SHIFT_STEP_SEC = 0.02;
/** Margen alrededor de una estrella con lecturas útiles (incluye el hueco máximo a interpolar). */
const NEIGHBOURHOOD_SEC = MAX_SAMPLE_GAP_SEC + HIT_WINDOW_SEC;

/** Primer índice con `time >= t` (el historial está ordenado por tiempo). */
function lowerBound(history: PitchSample[], t: number): number {
	let lo = 0;
	let hi = history.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (history[mid].time < t) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

/**
 * Busca el corrimiento de la voz respecto del ejercicio que más estrellas recoge. Si con un
 * corrimiento claro se aciertan bastantes más que sin él, la voz entra desfasada: la usa el
 * aviso de calibración del final del ejercicio.
 */
export function bestShift(stars: Star[], history: PitchSample[], tolerance: number): ShiftFit {
	const count = (shift: number): number => {
		let hits = 0;
		for (const star of stars) {
			const at = star.time - shift; // el instante de la estrella en el tiempo original de las lecturas
			const from = lowerBound(history, at - NEIGHBOURHOOD_SEC);
			const to = lowerBound(history, at + NEIGHBOURHOOD_SEC);
			if (from >= to) continue;
			const local = history.slice(from, to).map((s) => ({ time: s.time + shift, midi: s.midi }));
			if (isHit(star, local, tolerance)) hits++;
		}
		return hits;
	};
	const shifts: number[] = [];
	for (let s = SHIFT_MIN_SEC; s <= SHIFT_MAX_SEC + 1e-9; s += SHIFT_STEP_SEC)
		shifts.push(Math.round(s * 1000) / 1000);
	const hits = shifts.map((s) => count(s));
	const base = count(0);
	const top = Math.max(base, ...hits);
	if (base === top) return { shift: 0, hits: base, base };
	// Los corrimientos que aciertan lo máximo forman tramos; se toma el centro del más cercano a 0
	// (el centro, y no el borde, es el valor más robusto).
	let best: { from: number; to: number } | null = null;
	for (let i = 0; i < shifts.length; i++) {
		if (hits[i] !== top) continue;
		let j = i;
		while (j + 1 < shifts.length && hits[j + 1] === top) j++;
		const run = { from: shifts[i], to: shifts[j] };
		const dist = (r: { from: number; to: number }) => Math.min(Math.abs(r.from), Math.abs(r.to));
		if (!best || dist(run) < dist(best)) best = run;
		i = j;
	}
	const shift = best ? Math.round(((best.from + best.to) / 2) * 1000) / 1000 : 0;
	return { shift, hits: top, base };
}

/** ¿El mejor corrimiento mejora lo bastante como para pensar que hay un desfase de calibración? */
export function looksDesynced(fit: ShiftFit, starCount: number): boolean {
	if (starCount < 10) return false;
	const gain = fit.hits - fit.base;
	return (
		Math.abs(fit.shift) >= 0.06 &&
		gain >= Math.max(4, Math.round(starCount * 0.1)) &&
		fit.hits >= starCount * 0.3
	);
}

// ---------- resumen para el entrenador ----------

export interface WeakNote {
	midi: number;
	percent: number;
}

/** Cómo salió un ejercicio, en pocos números simples: es lo único que ve el entrenador de IA. */
export interface PerformanceSummary {
	percent: number;
	stars: number;
	reps: number;
	/** Porcentaje por repetición (las primeras 12). */
	repPercents: number[];
	/** Entre la primera y la segunda mitad de las repeticiones. */
	trend: 'up' | 'down' | 'steady';
	/** Hacia dónde se desvía la voz en lo que falla (por debajo o por encima de la nota). */
	tendency: 'low' | 'high' | 'none';
	/** Estrellas falladas en las que no había voz. */
	silentMissPercent: number;
	lowPercent: number;
	highPercent: number;
	weakNotes: WeakNote[];
}

const pct = (hit: number, total: number) => (total ? Math.round((hit / total) * 100) : 0);
/** Ventana alrededor de la estrella para medir hacia dónde se desvió la voz. */
const ERROR_WINDOW_SEC = 0.15;
const TENDENCY_SEMITONES = 0.25;

/** Resumen del ejercicio terminado a partir de las estrellas y de la voz cantada (`run`). */
export function analyzePerformance(stars: Star[], run: PitchSample[]): PerformanceSummary {
	const collected = stars.filter((s) => s.state === 'collected').length;
	const reps = scoreByRep(stars);
	const repPercents = reps.slice(0, 12).map((r) => pct(r.collected, r.total));

	const half = Math.floor(reps.length / 2);
	let trend: PerformanceSummary['trend'] = 'steady';
	if (half >= 1) {
		const sum = (list: RepScore[]) => [
			list.reduce((a, r) => a + r.collected, 0),
			list.reduce((a, r) => a + r.total, 0)
		];
		const [h1, t1] = sum(reps.slice(0, half));
		const [h2, t2] = sum(reps.slice(reps.length - half));
		const diff = pct(h2, t2) - pct(h1, t1);
		trend = diff >= 8 ? 'up' : diff <= -8 ? 'down' : 'steady';
	}

	// Hacia dónde se fue la voz en cada estrella fallada, y cuántas fallas fueron por silencio.
	let errorSum = 0;
	let errorCount = 0;
	let missed = 0;
	let silent = 0;
	for (const s of stars) {
		if (s.state === 'collected') continue;
		missed++;
		const from = lowerBound(run, s.time - ERROR_WINDOW_SEC);
		const to = lowerBound(run, s.time + ERROR_WINDOW_SEC);
		let nearest: PitchSample | undefined;
		for (let i = from; i < to; i++) {
			const r = run[i];
			if (r.midi === null) continue;
			if (!nearest || Math.abs(r.time - s.time) < Math.abs(nearest.time - s.time)) nearest = r;
		}
		if (!nearest) {
			silent++;
			continue;
		}
		errorSum += (nearest.midi as number) - s.midi;
		errorCount++;
	}
	const meanError = errorCount >= 3 ? errorSum / errorCount : 0;
	const tendency: PerformanceSummary['tendency'] =
		meanError <= -TENDENCY_SEMITONES ? 'low' : meanError >= TENDENCY_SEMITONES ? 'high' : 'none';

	// Graves contra agudos del propio ejercicio (la mitad de las estrellas a cada lado de la mediana).
	const midis = stars.map((s) => s.midi).sort((a, b) => a - b);
	const median = midis.length ? midis[Math.floor(midis.length / 2)] : 0;
	const lows = stars.filter((s) => s.midi < median);
	const highs = stars.filter((s) => s.midi >= median);
	const ok = (list: Star[]) => list.filter((s) => s.state === 'collected').length;

	// Las notas con más fallas (con al menos 3 estrellas, para que no sea casualidad).
	const byNote = new Map<number, { hit: number; total: number }>();
	for (const s of stars) {
		const n = byNote.get(s.midi) ?? { hit: 0, total: 0 };
		n.total++;
		if (s.state === 'collected') n.hit++;
		byNote.set(s.midi, n);
	}
	const weakNotes = [...byNote.entries()]
		.filter(([, n]) => n.total >= 3 && pct(n.hit, n.total) < 70)
		.map(([midi, n]) => ({ midi, percent: pct(n.hit, n.total) }))
		.sort((a, b) => a.percent - b.percent)
		.slice(0, 3);

	return {
		percent: pct(collected, stars.length),
		stars: stars.length,
		reps: reps.length,
		repPercents,
		trend,
		tendency,
		silentMissPercent: pct(silent, missed),
		lowPercent: pct(ok(lows), lows.length),
		highPercent: pct(ok(highs), highs.length),
		weakNotes
	};
}
