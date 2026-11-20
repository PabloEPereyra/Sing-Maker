// Declaración de edad para las funciones con IA. Los términos de Meta Model API (sección 10.1) piden que quien
// usa la IA tenga 18 años o más, así que antes de la primera llamada se pregunta una vez y se guarda en el
// navegador: «mayor» (se manda X-Adult: 1 y el servidor lo registra con su fecha) o «menor» (no se vuelve a
// preguntar y no se ofrece la IA; el entrenador da su devolución sin IA). Se cambia desde el perfil.
// Cerrar el diálogo sin elegir no guarda nada. El juego sin IA no pasa por acá.
const KEY = 'singmaker-adult';

export type AgeStatus = 'unknown' | 'adult' | 'minor';

export const age = $state({
	/** Lo que declaró en este navegador. */
	status: 'unknown' as AgeStatus,
	/** El diálogo está abierto esperando la respuesta. */
	asking: false
});

let loaded = false;
let waiting: ((ok: boolean) => void)[] = [];

function load(): void {
	if (loaded) return;
	loaded = true;
	try {
		const saved = localStorage.getItem(KEY);
		age.status = saved === '1' ? 'adult' : saved === '0' ? 'minor' : 'unknown';
	} catch {
		// sin almacenamiento: se pregunta en cada sesión
	}
}

function save(status: AgeStatus): void {
	age.status = status;
	try {
		if (status === 'unknown') localStorage.removeItem(KEY);
		else localStorage.setItem(KEY, status === 'adult' ? '1' : '0');
	} catch {
		// sin almacenamiento: vale para esta sesión
	}
}

/** Lo que declaró (lee lo guardado la primera vez). */
export function ageStatus(): AgeStatus {
	load();
	return age.status;
}

/** ¿Declaró ser mayor? */
export const isAdult = (): boolean => ageStatus() === 'adult';

/**
 * Resuelve `true` si ya declaró ser mayor o lo declara ahora en el diálogo; `false` si declaró (antes o ahora)
 * ser menor, o si cerró el diálogo sin elegir. A quien ya dijo ser menor no se le vuelve a preguntar.
 */
export function ensureAdult(): Promise<boolean> {
	const status = ageStatus();
	if (status === 'adult') return Promise.resolve(true);
	if (status === 'minor') return Promise.resolve(false);
	age.asking = true;
	return new Promise((resolve) => waiting.push(resolve));
}

function answer(ok: boolean): void {
	age.asking = false;
	const list = waiting;
	waiting = [];
	for (const resolve of list) resolve(ok);
}

export function confirmAdult(): void {
	save('adult');
	answer(true);
}

/** Declaró ser menor de 18: se guarda y no se le vuelve a ofrecer la IA. */
export function declareMinor(): void {
	save('minor');
	answer(false);
}

/** Cerró el diálogo sin elegir: no se guarda nada. */
export function dismissAge(): void {
	answer(false);
}

/** Desde el perfil: pasar a «mayor» abre el diálogo (con los términos); pasar a «menor» se guarda directo. */
export async function changeAge(to: 'adult' | 'minor'): Promise<void> {
	if (to === 'minor') {
		save('minor');
		return;
	}
	if (ageStatus() === 'adult') return;
	save('unknown');
	await ensureAdult();
}

/** Olvida la declaración (cuando el servidor no la tiene, p. ej. si se borraron los datos del sitio a medias). */
export function resetAdult(): void {
	save('unknown');
}
