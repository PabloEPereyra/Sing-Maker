// Dictado: voz hablada -> texto con Muse Voice Transcribe (Meta Model API, POST /asr/transcribe).
// Lo usa el servidor (functions/api/transcribe.ts); solo importa con rutas relativas.
import { GenerateError } from './generate';

export interface TranscribeConfig {
	baseUrl: string;
	apiKey: string;
	model: string;
}

export function transcribeConfigFromEnv(env: Record<string, string | undefined>): TranscribeConfig {
	return {
		baseUrl: (env.LLM_BASE_URL || '').replace(/\/$/, ''),
		apiKey: env.LLM_API_KEY || '',
		model: env.LLM_TRANSCRIBE_MODEL || 'muse-voice-transcribe-1.0'
	};
}

/** Palabras que conviene reconocer bien al dictar un ejercicio, por idioma. */
const KEYWORDS: Record<'es' | 'en', string[]> = {
	es: [
		'arpegio',
		'escala',
		'staccato',
		'legato',
		'ligado',
		'melisma',
		'corcheas',
		'semicorcheas',
		'negras',
		'blancas',
		'tresillo',
		'octava',
		'quinta',
		'tercera',
		'sirena',
		'vocal',
		'compás'
	],
	en: [
		'arpeggio',
		'scale',
		'staccato',
		'legato',
		'slur',
		'melisma',
		'eighth notes',
		'sixteenth notes',
		'quarter notes',
		'half notes',
		'triplet',
		'octave',
		'fifth',
		'third',
		'siren'
	]
};

/**
 * Transcribe un WAV (mono, 16 o 24 kHz, PCM). `lang` (el de la interfaz) solo prioriza las palabras
 * clave; si el proveedor no es Meta, el dictado no está disponible.
 */
export async function transcribeSpeech(
	wav: Uint8Array,
	lang: 'es' | 'en',
	config: TranscribeConfig,
	fetchImpl: typeof fetch = fetch
): Promise<string> {
	if (!config.apiKey) throw new GenerateError('Missing LLM_API_KEY on the server.', 500);
	if (!/meta\.(ai|com)/.test(config.baseUrl))
		throw new GenerateError('Dictation needs the Meta Model API (Muse Voice Transcribe).', 501);
	const form = new FormData();
	form.append(
		'request',
		new Blob(
			[
				JSON.stringify({
					model: config.model,
					audioEncoding: 'WAV',
					mode: 'PUSH_TO_TALK',
					// Sin languageBias: el idioma se detecta solo (la interfaz puede estar en otro idioma
					// que el que se habla). Las palabras clave orientan los términos musicales.
					keywords: [...KEYWORDS[lang], ...KEYWORDS[lang === 'es' ? 'en' : 'es']]
				})
			],
			{ type: 'application/json' }
		)
	);
	form.append('audio', new Blob([wav as BlobPart], { type: 'audio/wav' }), 'dictado.wav');
	const res = await fetchImpl(`${config.baseUrl}/asr/transcribe`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${config.apiKey}`, Accept: 'application/json' },
		body: form
	});
	if (!res.ok) {
		const text = await res.text().catch(() => '');
		throw new GenerateError(`Transcription error ${res.status}`, 502, [text.slice(0, 300)]);
	}
	const data = (await res.json()) as { transcript?: string };
	return (data.transcript ?? '').trim();
}
