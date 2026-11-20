// Declaración de edad para las funciones con IA. Los términos de Meta Model API (sección 10.1) piden que quien
// usa la IA tenga 18 años o más, así que antes de la primera llamada se pregunta una vez y se guarda en el
// navegador. El servidor recibe X-Adult: 1 (ver identityHeaders) y registra la declaración con su fecha.
// El juego sin IA no pasa por acá.
const KEY = 'singmaker-adult';

export const age = $state({
	/** Ya declaró tener 18 años o más en este navegador. */
	confirmed: false,
	/** El diálogo está abierto esperando la respuesta. */
	asking: false
});

let loaded = false;
let waiting: ((ok: boolean) => void)[] = [];

function load(): void {
	if (loaded) return;
	loaded = true;
	try {
		age.confirmed = localStorage.getItem(KEY) === '1';
	} catch {
		// sin almacenamiento: se pregunta en cada sesión
	}
}

/** ¿Declaró ser mayor? (lee lo guardado la primera vez). */
export function isAdult(): boolean {
	load();
	return age.confirmed;
}

/** Resuelve `true` si ya declaró ser mayor o lo declara ahora en el diálogo; `false` si dice que no. */
export function ensureAdult(): Promise<boolean> {
	if (isAdult()) return Promise.resolve(true);
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
	age.confirmed = true;
	try {
		localStorage.setItem(KEY, '1');
	} catch {
		// sin almacenamiento: vale para esta sesión
	}
	answer(true);
}

export function declineAdult(): void {
	answer(false);
}

/** Olvida la declaración (cuando el servidor no la tiene, p. ej. si se borraron los datos del sitio a medias). */
export function resetAdult(): void {
	age.confirmed = false;
	try {
		localStorage.removeItem(KEY);
	} catch {
		// idem
	}
}
