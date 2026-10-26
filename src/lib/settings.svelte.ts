// Preferencias globales de la interfaz (idioma, cifrado de notas, coleccionable), persistidas.
import { midiToNote, midiToSolfege } from '$lib/music/notes';

export type Lang = 'es' | 'en';
export type Notation = 'solfege' | 'american';
export type CollectibleId = 'stars' | 'notes';
export type CharacterId = 'bird' | 'bird2';

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
}>({
	lang: 'es',
	notation: 'solfege',
	collectible: 'stars',
	character: 'bird'
});

export function loadSettings(): void {
	settings.lang = initialLang();
	settings.notation = settings.lang === 'es' ? 'solfege' : 'american';
	try {
		const s = JSON.parse(localStorage.getItem(KEY) ?? '{}');
		if (s.lang === 'es' || s.lang === 'en') settings.lang = s.lang;
		if (s.notation === 'solfege' || s.notation === 'american') settings.notation = s.notation;
		if (s.collectible === 'stars' || s.collectible === 'notes')
			settings.collectible = s.collectible;
		if (s.character === 'bird' || s.character === 'bird2') settings.character = s.character;
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
