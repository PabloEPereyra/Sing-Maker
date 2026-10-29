// Preferencias globales de la interfaz (idioma, cifrado de notas, coleccionable), persistidas.
import { midiToNote, midiToSolfege } from '$lib/music/notes';
import { DEFAULT_DIFFICULTY, isDifficulty, type Difficulty } from '$lib/game/difficulty';

export type Lang = 'es' | 'en';
export type Notation = 'solfege' | 'american';
export type CollectibleId = 'stars' | 'notes' | 'carrots' | `custom:${string}`;
/** Voladores (tema Cielo, eligen árbol de partida) y terrestres (tema Sendero); `custom:<id>` = creado con IA. */
export type CharacterId = 'bird' | 'bunny' | `custom:${string}`;

/** Corrección del retraso de la voz (ms, con signo) y límites del zoom del escenario. */
export const LATENCY_MIN_MS = -200;
export const LATENCY_MAX_MS = 500;
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2.5;

const KEY = 'singmaker-settings';

function initialLang(): Lang {
	if (typeof navigator === 'undefined') return 'es';
	return navigator.language?.toLowerCase().startsWith('es') ? 'es' : 'en';
}

export const settings = $state<{
	lang: Lang;
	notation: Notation;
	collectible: CollectibleId;
	character: CharacterId;
	/** Fondo creado con IA para caminantes / voladores (id del fondo; vacío = el de fábrica). */
	backgroundWalk: string;
	backgroundFly: string;
	/** Se suma a la latencia estimada: positivo si la voz se ve atrasada. */
	latencyMs: number;
	/** Zoom del escenario (1 = normal). */
	zoom: number;
	/** Sonidos de la interfaz (clics de los botones). */
	sfx: boolean;
	/** Margen de afinación de cada nota. */
	difficulty: Difficulty;
}>({
	lang: 'es',
	notation: 'solfege',
	collectible: 'stars',
	character: 'bird',
	latencyMs: 0,
	zoom: 1,
	sfx: true,
	difficulty: DEFAULT_DIFFICULTY,

	backgroundWalk: '',
	backgroundFly: ''
});

export function loadSettings(): void {
	settings.lang = initialLang();
	settings.notation = settings.lang === 'es' ? 'solfege' : 'american';
	try {
		const s = JSON.parse(localStorage.getItem(KEY) ?? '{}');
		if (s.lang === 'es' || s.lang === 'en') settings.lang = s.lang;
		if (s.notation === 'solfege' || s.notation === 'american') settings.notation = s.notation;
		if (
			['stars', 'notes', 'carrots'].includes(s.collectible) ||
			(typeof s.collectible === 'string' && /^custom:\w+$/.test(s.collectible))
		)
			settings.collectible = s.collectible;
		for (const key of ['backgroundWalk', 'backgroundFly'] as const)
			if (typeof s[key] === 'string' && /^\w{0,20}$/.test(s[key])) settings[key] = s[key];
		if (
			s.character === 'bird' ||
			s.character === 'bunny' ||
			(typeof s.character === 'string' && /^custom:\w+$/.test(s.character))
		)
			settings.character = s.character;
		if (typeof s.latencyMs === 'number')
			settings.latencyMs = Math.max(LATENCY_MIN_MS, Math.min(LATENCY_MAX_MS, s.latencyMs));
		if (typeof s.sfx === 'boolean') settings.sfx = s.sfx;
		if (isDifficulty(s.difficulty)) settings.difficulty = s.difficulty;
		if (typeof s.zoom === 'number') settings.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, s.zoom));
	} catch {}
}

export function saveSettings(): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(settings));
	} catch {}
}

/** Nombre de nota según el cifrado elegido (Do4 / C4). */
export function noteLabel(midi: number): string {
	return settings.notation === 'american' ? midiToNote(midi) : midiToSolfege(midi);
}

export function toggleNotation(): void {
	settings.notation = settings.notation === 'american' ? 'solfege' : 'american';
}
