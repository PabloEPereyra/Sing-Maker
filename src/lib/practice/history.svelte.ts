// Historial de resultados por ejercicio y objetivo de práctica elegido, guardados en el navegador. Con esto
// se arma «Tu rutina de hoy» y se ve cuánto mejoró cada ejercicio.
import { GOALS, type Attempt, type Goal } from './routine';

const KEY = 'singmaker-history';
/** Se guardan los últimos intentos: alcanza para la rutina y no crece sin límite. */
const MAX_ATTEMPTS = 500;

/** La rutina que se armó hoy: se guarda para que no cambie al terminar un ejercicio ni al recargar. */
export interface SavedRoutine {
	day: string;
	goal: Goal;
	/** Cada paso: el ejercicio del catálogo (`id`) y la técnica que se hace con él (`tech`). */
	items: { id: string; tech: string }[];
	/** Lo que mostró la prueba de nivel al armarla: si cambia, la rutina se arma de nuevo. */
	sig?: string;
}

export const history = $state<{ attempts: Attempt[]; goal: Goal; routine: SavedRoutine | null }>({
	attempts: [],
	goal: 'mix',
	routine: null
});

function save(): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(history));
	} catch {
		// sin almacenamiento: solo dura esta sesión
	}
}

export function loadHistory(): void {
	try {
		const s = JSON.parse(localStorage.getItem(KEY) ?? '{}');
		if (Array.isArray(s.attempts))
			history.attempts = s.attempts
				.filter(
					(a: Attempt) =>
						a && typeof a.id === 'string' && Number.isFinite(a.at) && Number.isFinite(a.pct)
				)
				.slice(-MAX_ATTEMPTS);
		if (GOALS.includes(s.goal)) history.goal = s.goal;
		const r = s.routine;
		// una rutina guardada con el formato anterior (sin técnicas) se descarta y se arma de nuevo
		if (
			r &&
			typeof r.day === 'string' &&
			GOALS.includes(r.goal) &&
			Array.isArray(r.items) &&
			r.items.every(
				(i: { id?: unknown; tech?: unknown }) =>
					typeof i?.id === 'string' && typeof i?.tech === 'string'
			)
		)
			history.routine = { ...r, sig: typeof r.sig === 'string' ? r.sig : undefined };
	} catch {}
}

/** Anota cómo salió un ejercicio terminado. */
export function recordAttempt(id: string, pct: number, at = Date.now()): void {
	history.attempts = [...history.attempts, { id, at, pct: Math.round(pct) }].slice(-MAX_ATTEMPTS);
	save();
}

export function setGoal(goal: Goal): void {
	history.goal = goal;
	save();
}

export function setRoutine(routine: SavedRoutine): void {
	history.routine = routine;
	save();
}
