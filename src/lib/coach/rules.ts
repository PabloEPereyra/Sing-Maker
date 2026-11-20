// Reglas del entrenador que no necesitan IA: cuándo se recomienda subir de nivel y qué ejercicios de la lista
// encajan con el resultado. Las usan el entrenador con IA (en el servidor) y el entrenador sin IA (en el
// navegador), así que este módulo no importa nada más.

/** A partir de este porcentaje la recomendación es para subir de nivel. */
export const LEVEL_UP_PERCENT = 85;

export interface RuleExercise {
	id: string;
	level: string;
	category: string;
	/** Posición en la lista de ejercicios (de más fácil a más difícil), si es del catálogo. */
	order?: number;
}

/**
 * Candidatos coherentes con cómo salió: al subir de nivel solo los que van después del ejercicio actual
 * en la lista; si no, solo los anteriores. Sin posición (ejercicio propio) se dejan todos.
 */
export function eligible<T extends RuleExercise>(
	exercise: RuleExercise,
	percent: number,
	candidates: T[]
): T[] {
	const here = exercise.order;
	if (here === undefined) return candidates;
	const up = percent >= LEVEL_UP_PERCENT;
	return candidates.filter((c) =>
		c.order === undefined ? true : up ? c.order > here : c.order < here
	);
}

/**
 * El ejercicio que sigue según el resultado: al subir de nivel, el más cercano de los siguientes de la lista;
 * si no, el más cercano de los anteriores (un paso más fácil). Se prefiere la misma categoría.
 */
export function nextExercise<T extends RuleExercise>(
	exercise: RuleExercise,
	percent: number,
	candidates: T[]
): T | undefined {
	const list = eligible(exercise, percent, candidates).filter((c) => c.id !== exercise.id);
	if (!list.length) return undefined;
	const up = percent >= LEVEL_UP_PERCENT;
	const here = exercise.order;
	const distance = (c: T) =>
		here !== undefined && c.order !== undefined
			? Math.abs(c.order - here)
			: Math.abs((Number(c.level) || 1) - (Number(exercise.level) || 1)) * 100 + 50;
	const sameCategory = list.filter((c) => c.category === exercise.category);
	const pool = sameCategory.length ? sameCategory : list;
	// Sin posición en la lista: al subir, uno de nivel igual o mayor; si no, igual o menor.
	const byLevel =
		here === undefined
			? pool.filter((c) =>
					up ? Number(c.level) >= Number(exercise.level) : Number(c.level) <= Number(exercise.level)
				)
			: pool;
	return [...(byLevel.length ? byLevel : pool)].sort((a, b) => distance(a) - distance(b))[0];
}
