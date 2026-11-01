// Rutina de práctica del día: 4 pasos, cada uno con una técnica vocal («Haz un trino de labios…») y un ejercicio
// del catálogo. Todos los ejercicios son del nivel cómodo de la persona según el historial: lo que cambia de un
// paso a otro es qué se hace con la voz. Todo es local y determinista: el mismo día, con el mismo historial,
// sale la misma rutina; al día siguiente cambia.
import type { Exercise } from '$lib/exercises/catalog';
import { TECHNIQUES, type Kind, type Shape, type Technique } from './techniques';

export type Goal = 'mix' | 'high' | 'pitch' | 'sustain';
export const GOALS: Goal[] = ['mix', 'high', 'pitch', 'sustain'];

/** El orden de la rutina: calentar, resonar, abrir y, al final, lo que pide el objetivo. */
export const KINDS: Kind[] = ['warm', 'resonance', 'open', 'focus'];

export interface Attempt {
	id: string;
	/** Momento en que terminó el ejercicio (ms). */
	at: number;
	/** Porcentaje de estrellas recogidas. */
	pct: number;
}

/** Lo que se sabe de la voz por la prueba de nivel (aunque quedara a medias). */
export interface Ability {
	/** Nivel del catálogo del último ejercicio aprobado. */
	level: number;
	/** Ya canta escalas: no hace falta la nota simple y el calentamiento puede ser sobre una escala. */
	scales: boolean;
}

export interface RoutineItem {
	technique: Technique;
	exercise: Exercise;
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

/** Cuánto le sirve un patrón a una técnica según la forma que pide (más alto = mejor). */
export function shapeScore(f: Features, shape: Shape): number {
	switch (shape) {
		case 'sustained':
			return f.sustain * 4 + f.legato * 3;
		case 'agile':
			return f.step + f.span * 0.3;
		case 'high':
			return f.top + (f.asc ? 2 : 0);
		default:
			// por grados conjuntos y con poco recorrido
			return -(f.step + f.span * 0.25);
	}
}

export interface RoutineInput {
	/** Ejercicios que se pueden proponer (los visibles; los propios no entran). */
	pool: Exercise[];
	attempts: Attempt[];
	goal: Goal;
	/** Ahora (ms): define el día de la rutina. */
	now: number;
	/** Lo que mostró la prueba de nivel, completa o a medias; sin ella manda solo el historial. */
	ability?: Ability | null;
}

export function buildRoutine({ pool, attempts, goal, now, ability }: RoutineInput): RoutineItem[] {
	const catalog = pool.filter((e) => !Number.isNaN(Number(e.level)));
	if (!catalog.length) return [];
	// el nivel cómodo es el mayor entre lo que muestra el historial y lo que mostró la prueba de nivel
	const comfort = Math.max(comfortLevel(attempts, catalog), ability?.level ?? 1);
	const best = bestById(attempts);
	const random = rng(`${dayKey(now)}|${goal}`);
	const feats = new Map(catalog.map((e) => [e.id, features(e)]));
	// ya canta escalas: lo dice la prueba o un ejercicio con recorrido cantado bien (70 % o más)
	const scales =
		!!ability?.scales ||
		catalog.some((e) => (best.get(e.id) ?? 0) >= 70 && feats.get(e.id)!.span > 0);
	const chosen = new Set<string>();
	const categories = new Set<string>();

	// todos los ejercicios son del nivel cómodo; si ahí no alcanzan, también los de abajo
	const level = (e: Exercise) => Number(e.level);
	const atLevel = catalog.filter((e) => level(e) === comfort);
	const base =
		atLevel.length >= KINDS.length ? atLevel : catalog.filter((e) => level(e) <= comfort);
	// la nota simple repetida (sin recorrido) es solo para quien todavía le cuesta afinar
	const moving = base.filter((e) => feats.get(e.id)!.span > 0);
	const candidates = (scales || comfort > 1) && moving.length >= KINDS.length ? moving : base;
	const isScale = (e: Exercise) => /escala|scale/i.test(e.category);
	// quien ya hace escalas calienta sobre una escala
	const scaleCandidates = scales ? candidates.filter(isScale) : [];

	/** El patrón que mejor le va a la técnica, con un desempate al azar y sin repetir. */
	const pick = (technique: Technique): Exercise | undefined => {
		let top: Exercise | undefined;
		let topScore = -Infinity;
		const from =
			technique.kind === 'warm' && scaleCandidates.some((e) => !chosen.has(e.id))
				? scaleCandidates
				: candidates;
		for (const e of from) {
			if (chosen.has(e.id)) continue;
			const last = lastPercent(attempts, e.id);
			// ya dominado: puede aparecer, pero después; misma categoría que otro de hoy: un poco menos;
			// para afinar, lo que salió flojo conviene repetirlo
			const s =
				shapeScore(feats.get(e.id)!, technique.shape) +
				random() * 1.5 -
				((best.get(e.id) ?? 0) >= 92 ? 3 : 0) -
				(categories.has(e.category) ? 1 : 0) +
				(goal === 'pitch' && last !== null && last < 85 ? (85 - last) / 10 : 0);
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

	const items: RoutineItem[] = [];
	for (const kind of KINDS) {
		const techniques = TECHNIQUES.filter(
			(t) => t.kind === kind && (kind !== 'focus' || t.goals?.includes(goal))
		);
		if (!techniques.length) continue;
		const technique = techniques[Math.floor(random() * techniques.length)];
		const exercise = pick(technique);
		if (exercise) items.push({ technique, exercise });
	}
	return items;
}
