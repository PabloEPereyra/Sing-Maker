// Pedidos JSON al servidor (/api/*): agregan la identificación y traducen los errores de acceso y
// de cupo (401, 402 y 429) a mensajes para la persona. Los demás errores los resuelve quien llama.
import { identityHeaders } from '../access.svelte';
import { ensureAdult, resetAdult } from '../age.svelte';
import { t } from '../i18n';
import { WELCOME_CREDITS } from '../pricing';
import { refreshWallet, wallet } from '../wallet.svelte';
import { GenerateRequestError } from './client';

export type Bucket = 'exercises' | 'characters' | 'images' | 'other';

/** Cuerpo de las respuestas: el resultado, o `error` (con `details` y, en un cupo agotado, `bucket`). */
export interface ApiBody {
	error?: string;
	details?: string[];
	bucket?: Bucket;
	[key: string]: unknown;
}

const headers = (): Record<string, string> => ({
	'Content-Type': 'application/json',
	...identityHeaders()
});

/** Mensaje legible para un error de acceso o de cupo, o `null` si es otro tipo de error. */
export function accessMessage(status: number, data: ApiBody): string | null {
	if (status === 403 && data.error === 'age_confirmation_required') return t('age.required');
	if (status === 401)
		return t(data.error === 'invalid_access_code' ? 'access.invalid' : 'access.required');
	if (status === 429 && data.error === 'quota_exceeded')
		return t(`access.quota.${data.bucket ?? 'other'}`);
	if (status === 402 && data.error === 'login_required')
		return t('account.loginRequired', { n: wallet.report?.welcome ?? WELCOME_CREDITS });
	if (status === 402 && data.error === 'credits_required') return t('account.creditsRequired');
	return null;
}

/**
 * POST con JSON; devuelve la respuesta y su cuerpo ya leído. Todos estos pedidos usan la IA, así que antes
 * se asegura de que la persona haya declarado tener 18 años o más.
 */
export async function postJson<T = unknown>(
	path: string,
	body: unknown,
	signal?: AbortSignal
): Promise<{ res: Response; data: ApiBody & Partial<T> }> {
	if (!(await ensureAdult())) throw new GenerateRequestError(t('age.declined'));
	const res = await fetch(path, {
		method: 'POST',
		headers: headers(),
		body: JSON.stringify(body),
		signal
	});
	const data = await res.json().catch(() => ({}));
	// Cada llamada pudo gastar cupo o créditos: el indicador de los creadores se pone al día.
	void refreshWallet();
	// El servidor no tiene la declaración: se vuelve a preguntar la próxima vez.
	if (res.status === 403 && data.error === 'age_confirmation_required') resetAdult();
	const message = accessMessage(res.status, data);
	if (message) throw new GenerateRequestError(message);
	return { res, data };
}
