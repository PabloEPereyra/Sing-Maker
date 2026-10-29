// Prueba de nivel jugada: cada etapa es un ejercicio del catálogo en 4 tonalidades repartidas por el
// rango de la voz. Con el porcentaje de pasar se sigue a la etapa siguiente; si no, se aconseja empezar
// en un ejercicio más fácil. Van 4 etapas del nivel 1 y 2 de cada uno de los niveles 2 y 3.
import { exercises, levelExercise, type Exercise } from './catalog';

/** Porcentaje de estrellas recogidas para pasar una etapa. */
export const PASS_PERCENT = 85;
/** Tonalidades (repeticiones) de cada etapa. */
export const KEYS_PER_STAGE = 4;

/** Un ejercicio del catálogo (nivel y número dentro de él). */
interface Ref {
	level: string;
	n: number;
}

interface Stage {
	/** Ejercicio que se canta en la etapa. */
	exercise: Ref;
	/** Dónde se aconseja empezar si no se pasa la etapa. */
	fallback: Ref;
}

/** De la más fácil a la más difícil. */
const STAGE_LIST: Stage[] = [
	{ exercise: { level: '1', n: 1 }, fallback: { level: '1', n: 1 } },
	{ exercise: { level: '1', n: 3 }, fallback: { level: '1', n: 2 } },
	{ exercise: { level: '1', n: 6 }, fallback: { level: '1', n: 4 } },
	{ exercise: { level: '1', n: 9 }, fallback: { level: '1', n: 7 } },
	{ exercise: { level: '2', n: 1 }, fallback: { level: '1', n: 10 } },
	{ exercise: { level: '2', n: 4 }, fallback: { level: '2', n: 1 } },
	{ exercise: { level: '3', n: 1 }, fallback: { level: '2', n: 6 } },
	{ exercise: { level: '3', n: 5 }, fallback: { level: '3', n: 1 } }
];
/** Si se pasa todo, se aconseja seguir por lo que la prueba no tocó del nivel 3. */
const AFTER_ALL: Ref = { level: '3', n: 3 };

export const STAGES = STAGE_LIST.length;

const pick = (r: Ref): Exercise => levelExercise(r.level, r.n) ?? exercises[0];

export const stageExercise = (stage: number): Exercise => pick(STAGE_LIST[stage].exercise);

export interface StageOutcome {
	passed: boolean;
	/** Con `null` hay otra etapa; si no, la prueba terminó y se aconseja empezar por este ejercicio. */
	startAt: Exercise | null;
}

/** Qué sigue después de jugar la etapa `stage` con ese porcentaje. */
export function outcome(stage: number, percent: number): StageOutcome {
	const passed = percent >= PASS_PERCENT;
	if (!passed) return { passed, startAt: pick(STAGE_LIST[stage].fallback) };
	if (stage < STAGES - 1) return { passed, startAt: null };
	return { passed, startAt: pick(AFTER_ALL) };
}
