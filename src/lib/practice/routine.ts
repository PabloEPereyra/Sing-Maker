// Rutina de práctica del día: 4 ejercicios del catálogo elegidos según el nivel que muestra el historial y
// un objetivo (variada, agudos, afinar, notas largas). Todo es local y determinista: el mismo día, con el
// mismo historial, sale la misma rutina; al día siguiente cambia.
import type { Exercise } from '$lib/exercises/catalog';

export type Goal = 'mix' | 'high' | 'pitch' | 'sustain';
export const GOALS: Goal[] = ['mix', 'high', 'pitch', 'sustain'];

/** Papel de cada ejercicio en la rutina: calentar, trabajar el objetivo o un desafío al final. */
export type Role = 'warm' | 'goal' | 'challenge';

export interface Attempt {
	id: string;
	/** Momento en que terminó el ejercicio (ms). */
	at: number;
	/** Porcentaje de estrellas recogidas. */
	pct: number;
}

export interface RoutineItem {
	exercise: Exercise;
	role: Role;
}

export interface Features {
	/** Nivel del catálogo (NaN si es un ejercicio propio). */
	level: number;
	/** Semitonos del punto más agudo sobre la raíz. */
	top: number;
	/** Recorrido total del patrón. */
	span: number;
	/** Duración media de las notas cantadas, en tiempos. */
	sustain: number;
	/** Fracción de notas ligadas. */
	legato: number;
	/** Salto medio entre notas consecutivas (en semitonos): bajo = por grados conjuntos. */
	step: number;
	asc: boolean;
}

export function features(e: Exercise): Features {
	const sung = e.parsed.notes.filter((n) => !n.isRest && !n.isHint);
	const offsets = sung.map((n) => n.semitones);
	const top = Math.max(0, ...offsets);
	const low = Math.min(0, ...offsets);
	const jumps = offsets.slice(1).map((s, i) => Math.abs(s - offsets[i]));
	const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
	return {
		level: Number(e.level),
		top,
		span: top - low,
		sustain: mean(sung.map((n) => n.duration)),
		legato: sung.length ? sung.filter((n) => n.legato).length / sung.length : 0,
		step: mean(jumps),
		asc: e.parsed.meta.direction === 'asc'
	};
}

/** Día local como «2026-10-31» (la rutina cambia a medianoche, hora del dispositivo). */
export function dayKey(ms: number): string {
	const d = new Date(ms);
	const p = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Mejor resultado reciente de cada ejercicio (el de cada intento más alto). */
function bestById(attempts: Attempt[]): Map<string, number> {
	const best = new Map<string, number>();
	for (const a of attempts) best.set(a.id, Math.max(best.get(a.id) ?? 0, a.pct));
	return best;
}

/** Resultado del último intento de un ejercicio, o `null` si nunca se jugó. */
export function lastPercent(attempts: Attempt[], id: string): number | null {
	for (let i = attempts.length - 1; i >= 0; i--) if (attempts[i].id === id) return attempts[i].pct;
	return null;
}

/** Resultado del intento anterior al último (para decir «subiste o bajaste»), o `null`. */
export function previousPercent(attempts: Attempt[], id: string): number | null {
	let seen = 0;
	for (let i = attempts.length - 1; i >= 0; i--) {
		if (attempts[i].id !== id) continue;
		if (++seen === 2) return attempts[i].pct;
	}
	return null;
}

export function doneToday(attempts: Attempt[], id: string, now: number): boolean {
	const today = dayKey(now);
	return attempts.some((a) => a.id === id && dayKey(a.at) === today);
}

/**
 * Nivel con el que se siente cómoda la persona: el más alto donde al menos dos ejercicios distintos tienen un
 * mejor resultado de 70 % o más. Sin historial, el 1.
 */
export function comfortLevel(attempts: Attempt[], pool: Exercise[]): number {
	const levelOf = new Map(pool.map((e) => [e.id, Number(e.level)]));
	const solid = new Map<number, number>();
	for (const [id, pct] of bestById(attempts)) {
		const level = levelOf.get(id);
		if (level === undefined || Number.isNaN(level) || pct < 70) continue;
		solid.set(level, (solid.get(level) ?? 0) + 1);
	}
	return Math.max(1, ...[...solid].filter(([, n]) => n >= 2).map(([level]) => level));
}

/** Generador pseudoaleatorio con semilla (mulberry32) para desempatar sin que la rutina cambie al recargar. */
function rng(seed: string): () => number {
	let h = 1779033703 ^ seed.length;
	for (let i = 0; i < seed.length; i++) {
		h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
		h = (h << 13) | (h >>> 19);
	}
	let a = h >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Cuánto sirve un ejercicio para el objetivo (más alto = mejor). */
export function goalScore(f: Features, goal: Goal, last: number | null): number {
	switch (goal) {
		case 'high':
			return f.top + (f.asc ? 2 : 0);
		case 'sustain':
			return f.sustain * 4 + f.legato * 3;
		case 'pitch':
			// por grados conjuntos y, si ya se jugó y salió flojo, mejor todavía
			return -f.step + (last !== null && last < 85 ? (85 - last) / 10 : 0);
		default:
			return 0;
	}
}

export interface RoutineInput {
	/** Ejercicios que se pueden proponer (los visibles; los propios no entran). */
	pool: Exercise[];
	attempts: Attempt[];
	goal: Goal;
	/** Ahora (ms): define el día de la rutina. */
	now: number;
	size?: number;
}

export function buildRoutine({ pool, attempts, goal, now, size = 4 }: RoutineInput): RoutineItem[] {
	const catalog = pool.filter((e) => !Number.isNaN(Number(e.level)));
	if (!catalog.length) return [];
	const comfort = comfortLevel(attempts, catalog);
	const best = bestById(attempts);
	const random = rng(`${dayKey(now)}|${goal}`);
	const feats = new Map(catalog.map((e) => [e.id, features(e)]));
	const chosen = new Set<string>();
	const categories = new Set<string>();

	/** El ejercicio de mayor puntaje entre los candidatos, con un desempate al azar y sin repetir. */
	const pick = (
		candidates: Exercise[],
		score: (e: Exercise) => number,
		jitter = 1
	): Exercise | undefined => {
		let top: Exercise | undefined;
		let topScore = -Infinity;
		for (const e of candidates) {
			if (chosen.has(e.id)) continue;
			// ya dominado: puede aparecer, pero después; misma categoría que otra de hoy: un poco menos
			const s =
				score(e) +
				random() * jitter -
				((best.get(e.id) ?? 0) >= 92 ? 3 : 0) -
				(categories.has(e.category) ? 1 : 0);
			if (s > topScore) {
				top = e;
				topScore = s;
			}
		}
		if (top) {
			chosen.add(top.id);
			categories.add(top.category);
		}
		return top;
	};

	const level = (e: Exercise) => Number(e.level);
	const comfortable = catalog.filter((e) => level(e) <= comfort);
	const atLevel = catalog.filter((e) => level(e) === comfort || level(e) === comfort - 1);
	const harder = catalog.filter((e) => level(e) === comfort + 1);
	const last = (e: Exercise) => lastPercent(attempts, e.id);
	const fit = (e: Exercise) => goalScore(feats.get(e.id)!, goal, last(e));

	const items: RoutineItem[] = [];
	// calentamiento: lo más sencillo del nivel cómodo (poco recorrido y por grados conjuntos)
	const warm = pick(comfortable, (e) => -(feats.get(e.id)!.span + feats.get(e.id)!.step), 2);
	if (warm) items.push({ exercise: warm, role: 'warm' });
	// objetivo: lo que más sirve, en el nivel cómodo o el anterior; si es «variada», se reparte entre categorías
	for (let i = 0; i < Math.max(0, size - 2); i++) {
		const e = pick(atLevel.length ? atLevel : comfortable, fit, goal === 'mix' ? 6 : 1.5);
		if (e) items.push({ exercise: e, role: 'goal' });
	}
	// desafío: un escalón arriba (lo que todavía no se jugó primero)
	const hard = pick(
		harder.length ? harder : comfortable,
		(e) => fit(e) + (best.has(e.id) ? 0 : 2),
		goal === 'mix' ? 6 : 1.5
	);
	if (hard) items.push({ exercise: hard, role: 'challenge' });
	return items;
}
