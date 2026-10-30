// Código de acceso a las funciones con IA (lo reparte quien administra el sitio). Se guarda en el
// navegador y se manda en el encabezado X-Access-Code de cada pedido al servidor.
const KEY = 'singmaker-access';

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
