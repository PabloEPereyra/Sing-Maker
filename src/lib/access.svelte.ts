// Quién hace los pedidos a las funciones con IA. Siempre se manda un identificador anónimo del navegador
// (X-Client-Id) con el que el servidor cuenta el cupo de cada persona; si el sitio reparte códigos de
// acceso, también el código guardado (X-Access-Code).
const KEY = 'singmaker-access';
const CLIENT_KEY = 'singmaker-client';

export const access = $state({ code: '' });

export function loadAccess(): void {
	try {
		access.code = localStorage.getItem(KEY) ?? '';
	} catch {
		// sin almacenamiento: solo dura esta sesión
	}
}

export function saveAccess(code: string): void {
	access.code = code.trim();
	try {
		if (access.code) localStorage.setItem(KEY, access.code);
		else localStorage.removeItem(KEY);
	} catch {
		// sin almacenamiento: solo dura esta sesión
	}
}

let client = '';

/** Identificador anónimo de este navegador: se crea la primera vez y se guarda. */
export function clientId(): string {
	if (client) return client;
	try {
		client = localStorage.getItem(CLIENT_KEY) ?? '';
	} catch {
		// sin almacenamiento: el identificador dura lo que la pestaña
	}
	if (!client) {
		client = crypto.randomUUID();
		try {
			localStorage.setItem(CLIENT_KEY, client);
		} catch {
			// idem
		}
	}
	return client;
}

/** Encabezados de identificación de cada pedido al servidor. */
export function identityHeaders(): Record<string, string> {
	return {
		'X-Client-Id': clientId(),
		...(access.code ? { 'X-Access-Code': access.code } : {})
	};
}
