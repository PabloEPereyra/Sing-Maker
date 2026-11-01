// Progreso guardado de la prueba de nivel: la etapa en la que quedó quien eligió «Continuar luego». Solo se
// guarda a partir de la segunda etapa; con la primera no hay nada que recuperar.
import { STAGES } from './placement';

const KEY = 'singmaker-placement';
/** Etapas aprobadas de la última prueba (parcial o completa): sirve a la rutina aunque no se retome el test. */
const ABILITY_KEY = 'singmaker-ability';

/** Etapa (1 a STAGES − 1) en la que quedó la prueba, o `null` si no hay una empezada. */
export function loadPlacementStage(): number | null {
	try {
		const n = Number(JSON.parse(localStorage.getItem(KEY) ?? 'null')?.stage);
		return Number.isInteger(n) && n >= 1 && n < STAGES ? n : null;
	} catch {
		return null;
	}
}

/**
 * Guarda la etapa en la que se retoma (= etapas aprobadas hasta ahora); con la primera (o fuera de rango) no
 * queda nada para retomar.
 */
export function savePlacementStage(stage: number): void {
	if (!Number.isInteger(stage) || stage < 1 || stage >= STAGES) return clearPlacementStage();
	try {
		localStorage.setItem(KEY, JSON.stringify({ stage }));
	} catch {
		// sin almacenamiento: no se recupera
	}
	savePassed(stage);
}

/** La prueba terminó: ya no hay nada que retomar y quedan guardadas las etapas aprobadas (0 a STAGES). */
export function finishPlacement(passed: number): void {
	clearPlacementStage();
	savePassed(passed);
}

function savePassed(passed: number): void {
	if (!Number.isInteger(passed) || passed < 0 || passed > STAGES) return;
	try {
		localStorage.setItem(ABILITY_KEY, JSON.stringify({ passed }));
	} catch {
		// sin almacenamiento: la rutina se arma sin este dato
	}
}

/** Etapas aprobadas en la última prueba, o `null` si nunca se hizo. */
export function loadPassedStages(): number | null {
	try {
		const n = Number(JSON.parse(localStorage.getItem(ABILITY_KEY) ?? 'null')?.passed);
		return Number.isInteger(n) && n >= 0 && n <= STAGES ? n : null;
	} catch {
		return null;
	}
}

export function clearPlacementStage(): void {
	try {
		localStorage.removeItem(KEY);
	} catch {
		// nada que borrar
	}
}
