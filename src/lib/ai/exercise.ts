// Ejercicio generado por el modelo: esquema JSON, reglas de validación y conversión al formato
// de texto de la app. Lo usan el servidor (functions/api/generate.ts) y el navegador, así que
// solo importa con rutas relativas (sin el alias $lib).
import { z } from 'zod';

/** Duraciones en tiempos: múltiplos de semicorchea (0.25) hasta 4 (corchea = 0.5, blanca = 2…). */
export function isValidDuration(d: number): boolean {
	return d > 0 && d <= 4 && Number.isInteger(d * 4);
}
const MAX_NOTES = 64;
const MAX_SPAN = 19; // semitonos entre la nota más grave y la más aguda del patrón

export const GeneratedNoteSchema = z.object({
	/** Duración en tiempos. */
	d: z.number(),
	/** Semitonos respecto de la raíz (0 = raíz). Se ignora en silencios. */
	s: z.number(),
	rest: z.boolean().optional(),
	/** Nota guía: suena en el piano pero no se canta (se usa al comienzo, en la raíz). */
	hint: z.boolean().optional(),
	/** Ligada con la nota anterior (sin re-ataque). */
	legato: z.boolean().optional(),
	/** Corta: se canta la mitad de su duración. */
	staccato: z.boolean().optional(),
	/**
	 * Nombre de la nota tal como está escrita (p. ej. "Bb3"), solo al transcribir una partitura: la app
	 * calcula los semitonos desde estos nombres, que es más confiable que la cuenta del modelo.
	 */
	n: z.string().optional()
});

export const GeneratedExerciseSchema = z.object({
	name: z.string().min(1),
	description: z.string(),
	bpm: z.number(),
	beatsPerMeasure: z.number(),
	direction: z.enum(['asc', 'desc']),
	syllable: z.string(),
	notes: z.array(GeneratedNoteSchema)
});

export type GeneratedExercise = z.infer<typeof GeneratedExerciseSchema>;

/** JSON Schema equivalente, para pedir salida estructurada al modelo (response_format). */
export const GENERATED_EXERCISE_JSON_SCHEMA = {
	type: 'object',
	additionalProperties: false,
	required: ['name', 'description', 'bpm', 'beatsPerMeasure', 'direction', 'syllable', 'notes'],
	properties: {
		name: { type: 'string' },
		description: { type: 'string' },
		bpm: { type: 'number' },
		beatsPerMeasure: { type: 'number' },
		direction: { type: 'string', enum: ['asc', 'desc'] },
		syllable: { type: 'string' },
		notes: {
			type: 'array',
			items: {
				type: 'object',
				additionalProperties: false,
				// Esquema estricto: todos los campos obligatorios; los opcionales admiten null.
				required: ['d', 's', 'rest', 'hint', 'legato', 'staccato', 'n'],
				properties: {
					d: { type: 'number' },
					s: { type: 'number' },
					rest: { type: ['boolean', 'null'] },
					hint: { type: ['boolean', 'null'] },
					legato: { type: ['boolean', 'null'] },
					staccato: { type: ['boolean', 'null'] },
					n: { type: ['string', 'null'] }
				}
			}
		}
	}
} as const;

export interface VoiceRange {
	low: number;
	high: number;
}

/**
 * Reglas musicales y de la app. Devuelve la lista de errores (vacía si es válido), redactados
 * para que el modelo los pueda corregir en el siguiente intento.
 */
/** Duración de un compás en negras: 6 = 6/8 (3 negras); el resto, compases simples. */
export function measureLengthOf(beatsPerMeasure: number): number {
	return beatsPerMeasure === 6 ? 3 : beatsPerMeasure;
}

/**
 * Reglas de forma y musicales. Con `meter`, además exige ese compás y que el patrón (guía incluida)
 * llene compases enteros, para que la batería y el metrónomo no se desfasen.
 */
export function validateGenerated(
	ex: GeneratedExercise,
	range?: VoiceRange,
	meter?: '4/4' | '6/8'
): string[] {
	const errors: string[] = [];
	if (meter) {
		const want = meter === '6/8' ? 6 : 4;
		if (ex.beatsPerMeasure !== want)
			errors.push(`The time signature is ${meter}: beatsPerMeasure must be ${want}.`);
		const total = ex.notes.reduce((a, n) => a + n.d, 0);
		const measure = measureLengthOf(want);
		const left = total % measure;
		if (left > 1e-6 && measure - left > 1e-6)
			errors.push(
				`The notes add up to ${total} beats, which is not a whole number of ${meter} measures ` +
					`(${measure} beats each). Adjust durations (e.g. lengthen the last note) so the total ` +
					`is a multiple of ${measure}.`
			);
	}
	if (ex.notes.length < 2 || ex.notes.length > MAX_NOTES)
		errors.push(`Must have between 2 and ${MAX_NOTES} notes (has ${ex.notes.length}).`);
	if (ex.bpm < 40 || ex.bpm > 160) errors.push(`bpm must be between 40 and 160 (is ${ex.bpm}).`);
	if (![2, 3, 4, 6].includes(ex.beatsPerMeasure))
		errors.push(`beatsPerMeasure must be 2, 3, 4 or 6 (is ${ex.beatsPerMeasure}).`);
	ex.notes.forEach((n, i) => {
		if (!isValidDuration(n.d))
			errors.push(`Note ${i + 1}: duration ${n.d} must be a multiple of 0.25 between 0.25 and 4.`);
		if (!n.rest && (!Number.isInteger(n.s) || n.s < -12 || n.s > 24))
			errors.push(`Note ${i + 1}: semitones ${n.s} must be an integer between -12 and 24.`);
	});
	const sung = ex.notes.filter((n) => !n.rest && !n.hint);
	if (sung.length < 2) errors.push('Must have at least 2 notes to sing (not rests or hints).');
	const pitched = ex.notes.filter((n) => !n.rest).map((n) => n.s);
	if (pitched.length) {
		const span = Math.max(...pitched) - Math.min(...pitched);
		if (span > MAX_SPAN)
			errors.push(`Pattern spans ${span} semitones; keep it within ${MAX_SPAN}.`);
		if (range && span > range.high - range.low)
			errors.push(
				`Pattern spans ${span} semitones but the singer's range is only ${range.high - range.low}.`
			);
	}
	return errors;
}

function formatNumber(n: number): string {
	return Number.isInteger(n) ? String(n) : String(+n.toFixed(3));
}

/** Convierte al formato de texto de la app (el mismo de los ejercicios del catálogo). */
export function toCode(ex: GeneratedExercise): string {
	const lines = [
		`@name: ${ex.name.replace(/\n/g, ' ')}`,
		`@description: ${ex.description.replace(/\n/g, ' ')}`,
		`@bpm: ${Math.round(ex.bpm)}`,
		`@beatsPerMeasure: ${ex.beatsPerMeasure}`,
		// 6/8: el pulso es la corchea (las duraciones siguen en negras).
		...(ex.beatsPerMeasure === 6 ? ['@subdivision: 8'] : []),
		`@direction: ${ex.direction}`
	];
	if (ex.syllable) lines.push(`@syllable: ${ex.syllable}`);
	lines.push('');
	for (const n of ex.notes) {
		const d = formatNumber(n.d);
		if (n.rest) lines.push(`${d} r`);
		else {
			const s = n.s === 0 ? '=' : n.s > 0 ? `+${n.s}` : String(n.s);
			const marks = [n.hint && '!hint', n.legato && '~', n.staccato && '.'].filter(Boolean);
			lines.push([d, s, ...marks].join(' '));
		}
	}
	return lines.join('\n') + '\n';
}

/** Extrae el JSON de la respuesta del modelo (tolera bloques ```json y texto alrededor). */
const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "Bb3", "C#4", "F3" (también "B♭3") -> MIDI, o null si no se entiende. */
export function noteNameToMidi(name: string): number | null {
	const m = /^([A-Ga-g])\s*(#|♯|b|♭|##|bb)?\s*(-?\d)$/.exec(name.trim());
	if (!m) return null;
	const acc = { '#': 1, '♯': 1, '##': 2, b: -1, '♭': -1, bb: -2 }[m[2] ?? ''] ?? 0;
	return (Number(m[3]) + 1) * 12 + LETTER[m[1].toUpperCase()] + acc;
}

/**
 * Si todas las notas cantadas traen su nombre escrito, recalcula `s` desde los nombres (relativo a la
 * primera nota cantada). Devuelve el ejercicio sin los nombres.
 */
export function applyNoteNames(ex: GeneratedExercise): GeneratedExercise {
	const sung = ex.notes.filter((n) => !n.rest && !n.hint);
	const midis = sung.map((n) => (n.n ? noteNameToMidi(n.n) : null));
	const ok = sung.length > 0 && midis.every((m) => m !== null);
	const first = midis[0] ?? 0;
	let i = 0;
	return {
		...ex,
		notes: ex.notes.map((original) => {
			const note = { ...original };
			delete note.n;
			if (!ok || note.rest) return note;
			if (note.hint) return { ...note, s: 0 };
			return { ...note, s: midis[i++]! - first };
		})
	};
}

/**
 * Con esquemas estrictos (Meta, OpenAI) todos los campos son obligatorios y los opcionales llegan como
 * `null`: se quitan para validar igual que si no hubieran venido.
 */
export function dropNulls(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(dropNulls);
	if (value && typeof value === 'object')
		return Object.fromEntries(
			Object.entries(value)
				.filter(([, v]) => v !== null)
				.map(([k, v]) => [k, dropNulls(v)])
		);
	return value;
}

export function extractJson(text: string): unknown {
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
	const body = fenced ? fenced[1] : text;
	const start = body.indexOf('{');
	const end = body.lastIndexOf('}');
	if (start < 0 || end <= start) throw new Error('No JSON object in the response.');
	return JSON.parse(body.slice(start, end + 1));
}
