// Parser del formato de ejercicio (texto relativo a la raíz).
// Portado de vocalizator/src/scripts/parser.ts; se añadieron @bpm y @syllable y tipos más estrictos.

export type Direction = 'asc' | 'desc';

export interface ExerciseMeta {
	name: string;
	description: string;
	subcategory: string;
	level: string;
	bpm: number;
	syllable: string;
	beatsPerMeasure: number;
	subdivision: number;
	direction: Direction;
}

export interface ParsedNote {
	/** Duración en tiempos (beats). */
	duration: number;
	/** Semitonos respecto de la raíz. */
	semitones: number;
	isRest: boolean;
	/** Nota guía: suena en el piano pero no se canta. */
	isHint: boolean;
	legato: boolean;
	staccato: boolean;
	/** Sílaba propia de la nota (opcional, `"la"`). */
	syllable?: string;
}

export interface ParseResult {
	meta: ExerciseMeta;
	notes: ParsedNote[];
}

export const DEFAULT_BPM = 80;

export function parse(code: string): ParseResult {
	const meta: ExerciseMeta = {
		name: '',
		description: '',
		subcategory: '',
		level: '1',
		bpm: DEFAULT_BPM,
		syllable: '',
		beatsPerMeasure: 4,
		subdivision: 4,
		direction: 'asc'
	};
	const notes: ParsedNote[] = [];

	for (const raw of code.split('\n')) {
		const line = raw.trim();
		if (!line || line.startsWith('#')) continue;

		if (line.startsWith('@')) {
			const colonIdx = line.indexOf(':');
			if (colonIdx === -1) continue;
			const key = line.substring(1, colonIdx).trim().toLowerCase();
			const val = line.substring(colonIdx + 1).trim();
			switch (key) {
				case 'name':
					meta.name = val;
					break;
				case 'description':
					meta.description = val;
					break;
				case 'subcategory':
					meta.subcategory = val;
					break;
				case 'level':
					meta.level = val;
					break;
				case 'bpm':
					meta.bpm = clamp(parseInt(val) || DEFAULT_BPM, 20, 300);
					break;
				case 'syllable':
					meta.syllable = val;
					break;
				case 'beatspermeasure':
					meta.beatsPerMeasure = parseInt(val) || 4;
					break;
				case 'subdivision':
					meta.subdivision = parseInt(val) || 4;
					break;
				case 'direction':
					meta.direction = val.toLowerCase() === 'desc' ? 'desc' : 'asc';
					break;
			}
			continue;
		}

		for (const part of line.split(';')) {
			const note = parseNotePart(part.trim());
			if (note) notes.push(note);
		}
	}

	return { meta, notes };
}

export function parseNotePart(str: string): ParsedNote | null {
	if (!str) return null;
	const tokens = str.split(/\s+/);
	const duration = parseDuration(tokens[0]);
	if (duration === null || duration <= 0) return null;

	const note: ParsedNote = {
		duration,
		semitones: 0,
		isRest: false,
		isHint: false,
		legato: false,
		staccato: false
	};

	for (const token of tokens.slice(1)) {
		const t = token.toLowerCase();
		if (t === 'r' || t === 'rest') note.isRest = true;
		else if (t === 'h' || t === 'hint' || t === '!hint') note.isHint = true;
		else if (t === '~') note.legato = true;
		else if (t === '.') note.staccato = true;
		else if (t === '=' || t === '0') note.semitones = 0;
		else if (/^[+-]\d+$/.test(t)) note.semitones = parseInt(t);
		else if (/^".*"$/.test(token)) note.syllable = token.slice(1, -1);
	}

	return note;
}

export function parseDuration(str: string): number | null {
	if (str.includes('/')) {
		const [num, den] = str.split('/').map(Number);
		if (isNaN(num) || isNaN(den) || den === 0) return null;
		return num / den;
	}
	const val = parseFloat(str);
	return isNaN(val) ? null : val;
}

export function getTotalBeats(notes: ParsedNote[]): number {
	return notes.reduce((sum, n) => sum + n.duration, 0);
}

export function validate(meta: ExerciseMeta, notes: ParsedNote[]): string[] {
	const errors: string[] = [];
	const singable = notes.filter((n) => !n.isRest && !n.isHint);
	if (singable.length === 0) errors.push('El ejercicio no tiene notas para cantar');
	const totalBeats = getTotalBeats(notes);
	if (totalBeats > 0 && totalBeats % meta.beatsPerMeasure !== 0)
		errors.push(
			`Los tiempos totales (${totalBeats}) no son múltiplo de ${meta.beatsPerMeasure} (compás)`
		);
	return errors;
}

function clamp(v: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, v));
}
