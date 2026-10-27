// Cliente del navegador para /api/generate (la clave del modelo nunca pasa por acá).
import type { DrumResult } from './drums';
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

/**
 * Achica una foto (máximo 1800 px de lado) y la pasa a JPEG como data URL, para mandarla liviana.
 * Una partitura sigue legible a ese tamaño.
 */
export async function imageToDataUrl(file: Blob, maxSide = 1800): Promise<string> {
	const bitmap = await createImageBitmap(file);
	const k = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(bitmap.width * k);
	canvas.height = Math.round(bitmap.height * k);
	const g = canvas.getContext('2d')!;
	// Fondo blanco: las imágenes con transparencia quedarían negras en JPEG.
	g.fillStyle = '#ffffff';
	g.fillRect(0, 0, canvas.width, canvas.height);
	g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close();
	return canvas.toDataURL('image/jpeg', 0.9);
}

export async function requestExercise(
	prompt: string,
	lang: 'es' | 'en',
	range?: VoiceRange,
	image?: string,
	meter?: '4/4' | '6/8'
): Promise<GeneratedResponse> {
	const res = await fetch('/api/generate', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ prompt, lang, range, image, meter })
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok)
		throw new GenerateRequestError(data.error ?? `HTTP ${res.status}`, data.details ?? []);
	return data as GeneratedResponse;
}

/** Dictado: WAV (base64) -> texto, con Muse Voice Transcribe en el servidor. */
export async function requestTranscription(audio: string, lang: 'es' | 'en'): Promise<string> {
	const res = await fetch('/api/transcribe', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ audio, lang })
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok)
		throw new GenerateRequestError(data.error ?? `HTTP ${res.status}`, data.details ?? []);
	return String(data.text ?? '');
}

/** Patrón de batería (grilla de pasos por instrumento) para un compás. */
export async function requestDrumPattern(
	prompt: string,
	meter: '4/4' | '6/8',
	lang: 'es' | 'en'
): Promise<DrumResult> {
	const res = await fetch('/api/drums', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ prompt, meter, lang })
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok)
		throw new GenerateRequestError(data.error ?? `HTTP ${res.status}`, data.details ?? []);
	return data as DrumResult;
}
