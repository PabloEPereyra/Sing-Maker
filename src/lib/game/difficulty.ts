// Dificultad de afinación: 4 niveles fijos con los mismos márgenes que Karaoke Star (Voicexplorer),
// de fiesta (±100 ¢) a conservatorio (±25 ¢). El juego mide la tolerancia en semitonos.
export type Difficulty = 'easy' | 'normal' | 'hard' | 'expert';

/** Del más permisivo al más estricto; `cents` es el margen a cada lado de la nota. */
export const DIFFICULTIES: { id: Difficulty; cents: number }[] = [
	{ id: 'easy', cents: 100 },
	{ id: 'normal', cents: 75 },
	{ id: 'hard', cents: 50 },
	{ id: 'expert', cents: 25 }
];

export const DEFAULT_DIFFICULTY: Difficulty = 'normal';

export const isDifficulty = (v: unknown): v is Difficulty => DIFFICULTIES.some((d) => d.id === v);

export const centsOf = (d: Difficulty): number => DIFFICULTIES.find((x) => x.id === d)?.cents ?? 75;

/** Tolerancia en semitonos. */
export const toleranceOf = (d: Difficulty): number => centsOf(d) / 100;

/** El nivel cuyo margen es el más cercano a una tolerancia en semitonos. */
export function nearestDifficulty(toleranceSt: number): Difficulty {
	const cents = toleranceSt * 100;
	return DIFFICULTIES.reduce((best, d) =>
		Math.abs(d.cents - cents) < Math.abs(best.cents - cents) ? d : best
	).id;
}

/** El siguiente nivel más estricto, o null si ya es el más estricto. */
export function stricter(d: Difficulty): Difficulty | null {
	const i = DIFFICULTIES.findIndex((x) => x.id === d);
	return DIFFICULTIES[i + 1]?.id ?? null;
}
