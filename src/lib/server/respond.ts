// Respuesta JSON de las funciones de Pages (sin caché: cada respuesta es de una persona).
export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			'Cache-Control': 'no-store',
			...headers
		}
	});
}
