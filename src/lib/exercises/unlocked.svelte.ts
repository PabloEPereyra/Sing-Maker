// Ejercicios de la biblioteca oculta que ya se desbloquearon (los recomendó el entrenador de IA y se
// aceptaron): desde entonces aparecen en la lista. Se guardan en el navegador.
import { library, type Exercise } from './catalog';

const KEY = 'singmaker-unlocked';

export const unlocked = $state<{ ids: string[] }>({ ids: [] });

export function loadUnlocked(): void {
	try {
		const ids = JSON.parse(localStorage.getItem(KEY) ?? '[]');
		if (Array.isArray(ids))
			unlocked.ids = ids.filter((id) => typeof id === 'string' && library.some((e) => e.id === id));
	} catch {
		unlocked.ids = [];
	}
}

/** Los desbloqueados, en el orden de la biblioteca. */
export function unlockedExercises(): Exercise[] {
	return library.filter((e) => unlocked.ids.includes(e.id));
}

export const isHidden = (id: string): boolean =>
	library.some((e) => e.id === id) && !unlocked.ids.includes(id);

export function unlock(id: string): void {
	if (!library.some((e) => e.id === id) || unlocked.ids.includes(id)) return;
	unlocked.ids = [...unlocked.ids, id];
	try {
		localStorage.setItem(KEY, JSON.stringify(unlocked.ids));
	} catch {
		// sin almacenamiento: queda desbloqueado solo en esta sesión
	}
}
