// Cuenta de la persona: pedir el enlace de inicio de sesión, confirmarlo al volver desde el email
// (/?login=…) y cerrar la sesión. La sesión vive en una cookie HttpOnly que el navegador manda sola.
import { identityHeaders } from './access.svelte';
import { t } from './i18n';
import { settings } from './settings.svelte';

/** Aviso corto arriba de la pantalla (al entrar desde el enlace del email). */
export const accountNotice = $state({ text: '', error: false });

async function post(
	path: string,
	body: unknown
): Promise<{ res: Response; data: Record<string, unknown> }> {
	const res = await fetch(path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...identityHeaders() },
		body: JSON.stringify(body)
	});
	return { res, data: await res.json().catch(() => ({})) };
}

/** Pide el enlace. Devuelve el texto para mostrar y, en desarrollo, el enlace mismo. */
export async function requestLink(
	email: string
): Promise<{ ok: boolean; message: string; devLink?: string }> {
	try {
		const { res, data } = await post('/api/auth-start', { email, lang: settings.lang });
		if (res.ok)
			return {
				ok: true,
				message: t('account.sent', { email: email.trim() }),
				devLink: typeof data.devLink === 'string' ? data.devLink : undefined
			};
		if (data.error === 'invalid_email') return { ok: false, message: t('account.invalidEmail') };
		if (data.error === 'too_many_links') return { ok: false, message: t('account.tooMany') };
	} catch {
		// sin conexión: el mismo mensaje
	}
	return { ok: false, message: t('account.error') };
}

/** Si la app se abrió desde el enlace del email, lo confirma y saca el token de la dirección. */
export async function completeLoginFromUrl(): Promise<void> {
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- se usa una vez para limpiar la dirección, no es estado
	const url = new URL(location.href);
	const token = url.searchParams.get('login');
	if (!token) return;
	url.searchParams.delete('login');
	history.replaceState(history.state, '', url.pathname + url.search + url.hash);
	try {
		const { res, data } = await post('/api/auth-verify', { token });
		const email = (data.account as { email?: string } | undefined)?.email;
		if (res.ok && email) {
			accountNotice.text = t('account.welcome', { email });
			accountNotice.error = false;
			return;
		}
	} catch {
		// cae al aviso de enlace inválido
	}
	accountNotice.text = t('account.linkInvalid');
	accountNotice.error = true;
}

export async function signOut(): Promise<void> {
	await post('/api/auth-logout', {}).catch(() => null);
}
