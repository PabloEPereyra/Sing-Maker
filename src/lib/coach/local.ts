// Entrenador sin IA: arma una devolución corta con reglas a partir del resumen del ejercicio (porcentaje,
// tendencia, notas que fallaron) y elige el ejercicio siguiente de la lista (más difícil si le fue muy bien,
// más fácil si no). Lo ven quienes declararon ser menores de 18 (la IA de Meta es solo para mayores), quienes
// todavía no respondieron, y todos cuando la IA no responde. No manda nada a ningún servidor.
// Devuelve claves de texto con sus parámetros: el componente las traduce con t().
import { LEVEL_UP_PERCENT, nextExercise, type RuleExercise } from './rules';

export interface LocalSummary {
	percent: number;
	trend: 'up' | 'down' | 'steady';
	tendency: 'low' | 'high' | 'none';
	silentMissPercent: number;
	lowPercent: number;
	highPercent: number;
	/** Las notas que más fallaron, ya con su nombre para mostrar (p. ej. «Mi4»). */
	weakNotes: { note: string; percent: number }[];
}

export type LocalLine = { key: LocalKey; params?: Record<string, string | number> };

export type LocalKey =
	| 'coachLocal.great'
	| 'coachLocal.improving'
	| 'coachLocal.tired'
	| 'coachLocal.result'
	| 'coachLocal.desynced'
	| 'coachLocal.silent'
	| 'coachLocal.notesLow'
	| 'coachLocal.notesHigh'
	| 'coachLocal.notes'
	| 'coachLocal.low'
	| 'coachLocal.high'
	| 'coachLocal.highHarder'
	| 'coachLocal.lowHarder'
	| 'coachLocal.nextUp'
	| 'coachLocal.nextEasier'
	| 'coachLocal.mastered'
	| 'coachLocal.repeat';

export interface LocalAdvice<T> {
	lines: LocalLine[];
	/** El ejercicio que se recomienda practicar (si hay uno que encaje). */
	next?: T;
	levelUp: boolean;
}

/** Hacen falta al menos tantos puntos de diferencia para decir que una mitad del rango costó más. */
const HALF_GAP = 20;
/** Desde este porcentaje (y hasta el de subir de nivel) se recomienda repetir el mismo ejercicio. */
export const REPEAT_FROM = 60;
/** Con este porcentaje de estrellas perdidas sin voz se sugiere respirar y sostener. */
const SILENT_PERCENT = 40;

export function localCoach<T extends RuleExercise>(
	summary: LocalSummary,
	exercise: RuleExercise,
	candidates: T[],
	opts: { desynced?: boolean; listNotes: (notes: string[]) => string }
): LocalAdvice<T> {
	const levelUp = summary.percent >= LEVEL_UP_PERCENT;
	const lines: LocalLine[] = [];

	// 1. Lo que salió bien (o cómo fue en general).
	if (levelUp) lines.push({ key: 'coachLocal.great', params: { pct: summary.percent } });
	else if (summary.trend === 'up') lines.push({ key: 'coachLocal.improving' });
	else if (summary.trend === 'down') lines.push({ key: 'coachLocal.tired' });
	else lines.push({ key: 'coachLocal.result', params: { pct: summary.percent } });

	// 2. Una sola cosa para trabajar (la más útil), salvo que haya salido muy bien.
	if (!levelUp) {
		const notes = summary.weakNotes.slice(0, 2).map((w) => w.note);
		if (opts.desynced) lines.push({ key: 'coachLocal.desynced' });
		else if (summary.silentMissPercent >= SILENT_PERCENT) lines.push({ key: 'coachLocal.silent' });
		else if (notes.length) {
			const key =
				summary.tendency === 'low'
					? 'coachLocal.notesLow'
					: summary.tendency === 'high'
						? 'coachLocal.notesHigh'
						: 'coachLocal.notes';
			lines.push({ key, params: { notes: opts.listNotes(notes), n: notes.length } });
		} else if (summary.tendency === 'low') lines.push({ key: 'coachLocal.low' });
		else if (summary.tendency === 'high') lines.push({ key: 'coachLocal.high' });
		else if (summary.lowPercent - summary.highPercent >= HALF_GAP)
			lines.push({ key: 'coachLocal.highHarder' });
		else if (summary.highPercent - summary.lowPercent >= HALF_GAP)
			lines.push({ key: 'coachLocal.lowHarder' });
	}

	// 3. El paso siguiente: más difícil si salió muy bien, repetir si salió a medias, más fácil si costó mucho.
	const next =
		levelUp || summary.percent < REPEAT_FROM
			? nextExercise(exercise, summary.percent, candidates)
			: undefined;
	if (next) lines.push({ key: levelUp ? 'coachLocal.nextUp' : 'coachLocal.nextEasier' });
	else lines.push({ key: levelUp ? 'coachLocal.mastered' : 'coachLocal.repeat' });

	return { lines, next, levelUp };
}
