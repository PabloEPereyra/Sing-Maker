// Cliente del navegador para /api/generate (la clave del modelo nunca pasa por acá).
import type { GeneratedExercise, VoiceRange } from './exercise';

export interface GeneratedResponse {
	exercise: GeneratedExercise;
	code: string;
	attempts: number;
	model: string;
}

export class GenerateRequestError extends Error {
	constructor(
		message: string,
		readonly details: string[] = []
	) {
		super(message);
	}
}

export async function requestExercise(
	prompt: string,
	lang: 'es' | 'en',
	range?: VoiceRange
): Promise<GeneratedResponse> {
	const res = await fetch('/api/generate', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ prompt, lang, range })
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok)
		throw new GenerateRequestError(data.error ?? `HTTP ${res.status}`, data.details ?? []);
	return data as GeneratedResponse;
}
