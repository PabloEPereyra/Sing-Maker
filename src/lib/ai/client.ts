// Cliente del navegador para /api/generate (la clave del modelo nunca pasa por acá).
import type { DrumResult } from './drums';
import { postJson } from './http';
import type { GeneratedExercise, VoiceRange } from './exercise';

export interface GeneratedResponse {
	exercise: GeneratedExercise;
	code: string;
	attempts: number;
	model: string;
	/** Con imagen: qué modelo la leyó. */
	engine?: 'spark' | 'wonder';
	/** Dibujo sin escala indicada: la pregunta que hay que contestar antes de crear el ejercicio. */
	ask?: string;
}

export class GenerateRequestError extends Error {
	constructor(
		message: string,
		readonly details: string[] = []
	) {
		super(message);
	}
}

/** Debajo de este lado largo (px) una imagen se agranda: los modelos leen mal las notas de una captura chica. */
const SMALL_SIDE = 1400;
const MAX_UPSCALE = 3;

/**
 * Lleva una foto a 1800 px de lado como máximo (achica las grandes, agranda las chicas hasta 3x) y la pasa
 * a JPEG como data URL, para mandarla liviana. Agrandar una captura chica de una partitura mejora mucho
 * cómo el modelo distingue las alturas de las notas.
 */
export async function imageToDataUrl(file: Blob, maxSide = 1800): Promise<string> {
	const bitmap = await createImageBitmap(file);
	const side = Math.max(bitmap.width, bitmap.height);
	const k = side < SMALL_SIDE ? Math.min(MAX_UPSCALE, maxSide / side) : Math.min(1, maxSide / side);
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(bitmap.width * k);
	canvas.height = Math.round(bitmap.height * k);
	const g = canvas.getContext('2d')!;
	g.imageSmoothingQuality = 'high';
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
	meter?: '4/4' | '6/8',
	engine?: 'spark' | 'wonder'
): Promise<GeneratedResponse> {
	const { res, data } = await postJson<GeneratedResponse>('/api/generate', {
		prompt,
		lang,
		range,
		image,
		meter,
		engine
	});
	if (!res.ok)
		throw new GenerateRequestError(data.error ?? `HTTP ${res.status}`, data.details ?? []);
	return data as GeneratedResponse;
}

/** Dictado: WAV (base64) -> texto, con Muse Voice Transcribe en el servidor. */
export async function requestTranscription(audio: string, lang: 'es' | 'en'): Promise<string> {
	const { res, data } = await postJson('/api/transcribe', { audio, lang });
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
	const { res, data } = await postJson<DrumResult>('/api/drums', { prompt, meter, lang });
	if (!res.ok)
		throw new GenerateRequestError(data.error ?? `HTTP ${res.status}`, data.details ?? []);
	return data as DrumResult;
}
