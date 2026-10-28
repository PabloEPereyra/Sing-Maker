// Cliente del navegador para /api/coach (la clave del modelo nunca pasa por acá).
import type { CoachRequest, CoachResult } from './coach';
import { GenerateRequestError } from './client';

export async function requestCoach(req: CoachRequest, signal?: AbortSignal): Promise<CoachResult> {
	const res = await fetch('/api/coach', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(req),
		signal
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok)
		throw new GenerateRequestError(data.error ?? `HTTP ${res.status}`, data.details ?? []);
	return data as CoachResult;
}
