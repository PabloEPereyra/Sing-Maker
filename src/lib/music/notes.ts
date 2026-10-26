// Utilidades de notas. Portado de vocalizator/src/scripts/exercises.ts.

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SOLFEGE = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];

export function noteToMidi(note: string): number {
	const match = note.match(/^([A-G]#?)(-?\d+)$/);
	if (!match) return 60;
	return (parseInt(match[2]) + 1) * 12 + NOTE_NAMES.indexOf(match[1]);
}

export function midiToNote(midi: number): string {
	const m = Math.round(midi);
	return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}

export function midiToSolfege(midi: number): string {
	const m = Math.round(midi);
	return SOLFEGE[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}

export function midiToFreq(midi: number): number {
	return 440 * Math.pow(2, (midi - 69) / 12);
}

export function freqToMidi(freq: number): number {
	return 69 + 12 * Math.log2(freq / 440);
}
