// Catálogo de ejercicios prearmados: 30 ejercicios en 3 niveles de 10, los de la página
// /vocal-scales de voicexplorer. El resto del catálogo original quedó archivado fuera de git.
import { z } from 'zod';
import raw from '$lib/data/exercises.json';
import { parse, type ParseResult } from '$lib/music/parser';
import { meterLabel } from '$lib/music/meter';

const ExerciseSchema = z.object({
	id: z.string(),
	name: z.string(),
	category: z.string(),
	level: z.string(),
	code: z.string(),
	name_en: z.string(),
	description_en: z.string()
});

export type Exercise = z.infer<typeof ExerciseSchema> & { parsed: ParseResult };

export const exercises: Exercise[] = z
	.array(ExerciseSchema)
	.parse(raw)
	.map((e) => ({ ...e, parsed: parse(e.code) }));

/** Orden pedagógico de las categorías. */
const CATEGORY_ORDER = [
	'Tecnica y Sostenido',
	'Escalas Mayores',
	'Escalas Menores',
	'Escalas',
	'Arpegios Mayores',
	'Arpegios Menores',
	'Saltos y Octavas',
	'Melismas y Agilidad',
	'Modos'
];

/** Nombre y descripción en el idioma de la interfaz. */
export function exerciseText(
	e: Exercise,
	lang: 'es' | 'en'
): { name: string; description: string } {
	const label = ` (${meterLabel(e.parsed.meta)})`;
	return lang === 'en'
		? { name: e.name_en + label, description: e.description_en }
		: { name: e.name + label, description: e.parsed.meta.description };
}

export function byCategory(list: Exercise[] = exercises): [string, Exercise[]][] {
	const groups = new Map<string, Exercise[]>();
	for (const e of list) groups.set(e.category, [...(groups.get(e.category) ?? []), e]);
	const rank = (c: string) => {
		const i = CATEGORY_ORDER.indexOf(c);
		return i === -1 ? 99 : i;
	};
	return [...groups.entries()].sort((a, b) => rank(a[0]) - rank(b[0]));
}

/** Niveles y colores de cinturón de Vocalizator. */
const LEVELS: Record<string, { name: string; color: string }> = {
	'1': { name: 'Principiante', color: '#ffffff' },
	'2': { name: 'Buscador', color: '#fbbf24' },
	'3': { name: 'Discípulo', color: '#f97316' },
	'4': { name: 'Practicante', color: '#22c55e' },
	'5': { name: 'Adepto', color: '#3b82f6' },
	'6': { name: 'Instructor', color: '#78350f' },
	'7': { name: 'Maestro', color: '#000000' }
};

export interface LevelGroup {
	level: string;
	name: string;
	color: string;
	exercises: Exercise[];
	categories: [string, Exercise[]][];
}

export function byLevel(list: Exercise[] = exercises): LevelGroup[] {
	const groups = new Map<string, Exercise[]>();
	for (const e of list) groups.set(e.level, [...(groups.get(e.level) ?? []), e]);
	return [...groups.entries()]
		.sort((a, b) => Number(a[0]) - Number(b[0]))
		.map(([level, items]) => ({
			level,
			name: LEVELS[level]?.name ?? '',
			color: LEVELS[level]?.color ?? '#64748b',
			exercises: items,
			categories: byCategory(items)
		}));
}

export interface VoicePreset {
	id: string;
	name: string;
	low: number;
	high: number;
}

/** Rangos por tipo de voz (MIDI), los mismos de Voicexplorer/vocal-scales. */
export const VOICE_PRESETS: VoicePreset[] = [
	{ id: 'bass', name: 'Bajo', low: 40, high: 67 }, // E2–G4
	{ id: 'baritone', name: 'Barítono', low: 46, high: 69 }, // A#2–A4
	{ id: 'tenor', name: 'Tenor', low: 45, high: 72 }, // A2–C5
	{ id: 'alto', name: 'Contralto', low: 52, high: 79 }, // E3–G5
	{ id: 'mezzo', name: 'Mezzosoprano', low: 54, high: 81 }, // F#3–A5
	{ id: 'soprano', name: 'Soprano', low: 57, high: 84 } // A3–C6
];
