// Cliente del navegador para /api/coach (la clave del modelo nunca pasa por acá).
import type { CoachRequest, CoachResult } from './coach';
import { GenerateRequestError } from './client';
import { postJson } from './http';

export async function requestCoach(req: CoachRequest, signal?: AbortSignal): Promise<CoachResult> {
	const { res, data } = await postJson<CoachResult>('/api/coach', req, signal);
	if (!res.ok)
		throw new GenerateRequestError(data.error ?? `HTTP ${res.status}`, data.details ?? []);
	return data as CoachResult;
}
