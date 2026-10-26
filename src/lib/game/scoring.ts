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
