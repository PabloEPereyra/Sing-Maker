// Prueba de nivel jugada: cuatro etapas, cada una con un ejercicio del nivel 1 en 4 tonalidades
// repartidas por el rango de la voz. Con el porcentaje de pasar se sigue a la etapa siguiente; si no,
// se aconseja empezar en un ejercicio más fácil. (Más adelante se amplía a los niveles 2 y 3.)
import { exercises, levelExercise, type Exercise } from './catalog';

/** Porcentaje de estrellas recogidas para pasar una etapa. */
export const PASS_PERCENT = 85;
/** Tonalidades (repeticiones) de cada etapa. */
export const KEYS_PER_STAGE = 4;
/** Número, dentro del nivel 1, del ejercicio de cada etapa. */
export const STAGE_NUMBERS = [1, 3, 6, 9];
/** Dónde se aconseja empezar si no se pasa la etapa i. */
export const FALLBACK_NUMBERS = [1, 2, 4, 7];

export const STAGES = STAGE_NUMBERS.length;

export const stageExercise = (stage: number): Exercise =>
	levelExercise('1', STAGE_NUMBERS[stage]) ?? exercises[0];

export interface StageOutcome {
	passed: boolean;
	/** Con `null` hay otra etapa; si no, la prueba terminó y se aconseja empezar por este ejercicio. */
	startAt: Exercise | null;
}

/** Qué sigue después de jugar la etapa `stage` con ese porcentaje. */
export function outcome(stage: number, percent: number): StageOutcome {
	const passed = percent >= PASS_PERCENT;
	if (!passed)
		return { passed, startAt: levelExercise('1', FALLBACK_NUMBERS[stage]) ?? exercises[0] };
	if (stage < STAGES - 1) return { passed, startAt: null };
	// Pasó todo el nivel 1: empieza el nivel 2.
	return { passed, startAt: levelExercise('2', 1) ?? exercises[0] };
}
