// Pedidos JSON al servidor (/api/*): agregan el código de acceso y traducen los errores de acceso y
// de cupo (401 y 429) a mensajes para la persona. Los demás errores los resuelve quien llama.
import { access } from '../access.svelte';
import { t } from '../i18n';
import { GenerateRequestError } from './client';

export type Bucket = 'exercises' | 'images' | 'other';

/** Cuerpo de las respuestas: el resultado, o `error` (con `details` y, en un cupo agotado, `bucket`). */
export interface ApiBody {
	error?: string;
	details?: string[];
	bucket?: Bucket;
	[key: string]: unknown;
}

const headers = (): Record<string, string> => ({
	'Content-Type': 'application/json',
	...(access.code ? { 'X-Access-Code': access.code } : {})
});

/** Mensaje legible para un error de acceso o de cupo, o `null` si es otro tipo de error. */
export function accessMessage(status: number, data: ApiBody): string | null {
	if (status === 401)
		return t(data.error === 'invalid_access_code' ? 'access.invalid' : 'access.required');
	if (status === 429 && data.error === 'quota_exceeded')
		return t(`access.quota.${data.bucket ?? 'other'}`);
	return null;
}

/** POST con JSON; devuelve la respuesta y su cuerpo ya leído. */
export async function postJson<T = unknown>(
	path: string,
	body: unknown,
	signal?: AbortSignal
): Promise<{ res: Response; data: ApiBody & Partial<T> }> {
	const res = await fetch(path, {
		method: 'POST',
		headers: headers(),
		body: JSON.stringify(body),
		signal
	});
	const data = await res.json().catch(() => ({}));
	const message = accessMessage(res.status, data);
	if (message) throw new GenerateRequestError(message);
	return { res, data };
}
