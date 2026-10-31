// Técnicas vocales de la rutina: qué hacer con la voz en cada paso. El ejercicio (la escala o el patrón) sale
// siempre del catálogo y del nivel de la persona; la técnica solo dice cómo cantarlo. Los textos vienen de la
// lista de ejercicios de la app de canto, con la ortografía y la redacción corregidas.
import type { Goal } from './routine';

/** Lugar de la técnica en la rutina: calentar, resonar, abrir y trabajar el objetivo. */
export type Kind = 'warm' | 'resonance' | 'open' | 'focus';

/**
 * Qué tipo de patrón le va mejor a la técnica (entre los del nivel de la persona):
 * por grados conjuntos y poco recorrido, notas largas y ligadas, con más movimiento, o que llegue arriba.
 */
export type Shape = 'smooth' | 'sustained' | 'agile' | 'high';

export interface Technique {
	id: string;
	kind: Kind;
	shape: Shape;
	/** Solo para las de objetivo: con qué objetivos sirven. */
	goals?: Goal[];
	name: { es: string; en: string };
	/** Qué hacer con la voz, empezando con «Haz…». */
	how: { es: string; en: string };
}

export const TECHNIQUES: Technique[] = [
	// --- calentamiento ---
	{
		id: 'trino-labios',
		kind: 'warm',
		shape: 'smooth',
		name: { es: 'Trino de labios', en: 'Lip trill' },
		how: {
			es: 'Haz un trino de labios manteniendo la emisión relajada, cruzando de registro fuerte a débil. Sube hasta donde sea cómodo.',
			en: 'Do a lip trill keeping the sound relaxed, crossing from strong to weak register. Go up as far as is comfortable.'
		}
	},
	{
		id: 'trino-lengua',
		kind: 'warm',
		shape: 'smooth',
		name: { es: 'Trino de lengua', en: 'Tongue trill' },
		how: {
			es: 'Haz un trino de lengua manteniendo la emisión relajada, cruzando de registro fuerte a débil. Sube hasta donde sea cómodo.',
			en: 'Do a tongue trill keeping the sound relaxed, crossing from strong to weak register. Go up as far as is comfortable.'
		}
	},
	{
		id: 'pez-globo',
		kind: 'warm',
		shape: 'smooth',
		name: { es: 'Pez globo', en: 'Pufferfish' },
		how: {
			es: 'Haz una «B» inflando las mejillas, como un pez globo, y canta las notas con esa «B», con la emisión relajada.',
			en: 'Make a “B” with puffed-out cheeks, like a pufferfish, and sing the notes on that “B”, keeping the sound relaxed.'
		}
	},
	{
		id: 'sorbete',
		kind: 'warm',
		shape: 'smooth',
		name: { es: 'Sorbete', en: 'Straw' },
		how: {
			es: 'Haz las notas a través de un sorbete (pajita), con los labios cerrados alrededor y el aire saliendo de forma suave y constante.',
			en: 'Sing the notes through a straw, lips closed around it and the air flowing out softly and steadily.'
		}
	},
	{
		id: 'b-d-z',
		kind: 'warm',
		shape: 'smooth',
		name: { es: 'B, D y Z', en: 'B, D and Z' },
		how: {
			es: 'Haz las notas con las consonantes «B», «D» y «Z», una en cada repetición, con la emisión relajada.',
			en: 'Sing the notes on the consonants “B”, “D” and “Z”, one on each repetition, keeping the sound relaxed.'
		}
	},
	{
		id: 'sh',
		kind: 'warm',
		shape: 'smooth',
		name: { es: 'SH', en: 'SH' },
		how: {
			es: 'Haz las notas con la consonante «SH», con el aire parejo y la emisión relajada.',
			en: 'Sing the notes on the consonant “SH”, with an even airflow and a relaxed sound.'
		}
	},
	{
		id: 'uiu-aea',
		kind: 'warm',
		shape: 'smooth',
		name: { es: 'Labios y mandíbula', en: 'Lips and jaw' },
		how: {
			es: 'Haz «UIU» con los labios: la «U» bien adelante, como un beso, y la «I» bien hacia atrás, en sonrisa tirante. En el siguiente tono haz «AEA» solo con la mandíbula: abre la «A» en vertical, en un movimiento rápido, como si pesara y la dejaras caer, y vuelve a una «E» neutra y relajada. Alterna en cada tono.',
			en: 'Do “OOEE-OO” with your lips: the “OO” well forward, like a kiss, and the “EE” spread back in a tight smile. On the next tone do “AHEH-AH” with the jaw only: drop the “AH” open vertically in a quick movement, as if the jaw were heavy, and return to a neutral, relaxed “EH”. Alternate on each tone.'
		}
	},
	{
		id: 'masticacion-m',
		kind: 'warm',
		shape: 'smooth',
		name: { es: 'Masticación con M', en: 'Chewing on M' },
		how: {
			es: 'Haz una «M» masticando de un costado de la boca, como si tuvieras un chicle, y cambia de lado en cada tono.',
			en: 'Sing an “M” while chewing on one side of the mouth, as if you had chewing gum, and switch sides on each tone.'
		}
	},
	// --- resonancia ---
	{
		id: 'm',
		kind: 'resonance',
		shape: 'smooth',
		name: { es: 'M', en: 'M' },
		how: {
			es: 'Haz las notas con una «M», con los labios apenas cerrados y la emisión relajada.',
			en: 'Sing the notes on an “M”, with the lips barely closed and the sound relaxed.'
		}
	},
	{
		id: 'n',
		kind: 'resonance',
		shape: 'smooth',
		name: { es: 'N', en: 'N' },
		how: {
			es: 'Haz las notas con una «N», con la boca casi cerrada y la punta de la lengua detrás de los dientes de arriba.',
			en: 'Sing the notes on an “N”, with the mouth almost closed and the tip of the tongue behind the upper teeth.'
		}
	},
	{
		id: 'nei',
		kind: 'resonance',
		shape: 'sustained',
		name: { es: 'NEI', en: 'NEI' },
		how: {
			es: 'Haz la sílaba «NEI» manteniendo la boca casi cerrada y sin mover la mandíbula.',
			en: 'Sing the syllable “NAY” keeping the mouth almost closed and without moving the jaw.'
		}
	},
	// --- apertura ---
	{
		id: 'la-le',
		kind: 'open',
		shape: 'agile',
		name: { es: 'LA-LE', en: 'LA-LE' },
		how: {
			es: 'Haz «LA» o «LE» con bastante aire, mirando hacia arriba (unos 45°) y con la boca en sonrisa, bien abierta en horizontal, de modo que se vean los dientes de arriba. Intenta no mover la mandíbula (si hace falta, apoya un dedo debajo para controlarla).',
			en: 'Sing “LAH” or “LEH” with plenty of air, looking up (about 45°) with your mouth in a smile, wide open horizontally, so the upper teeth show. Try not to move the jaw (if needed, rest a finger under it to monitor it).'
		}
	},
	{
		id: 'la-a',
		kind: 'open',
		shape: 'smooth',
		name: { es: 'LA-A ligados', en: 'LA-A legato' },
		how: {
			es: 'Haz «LA» y luego «A», con las notas ligadas, mirando hacia arriba (unos 45°) y con la boca en sonrisa, bien abierta en horizontal, de modo que se vean los dientes de arriba.',
			en: 'Sing “LAH” and then “AH”, with the notes tied together, looking up (about 45°) with your mouth in a smile, wide open horizontally, so the upper teeth show.'
		}
	},
	// --- objetivo ---
	{
		id: 'ligados-a',
		kind: 'focus',
		shape: 'sustained',
		goals: ['mix', 'pitch'],
		name: { es: 'Ligados con A aireada', en: 'Breathy A legato' },
		how: {
			es: 'Haz las notas ligadas con una «A» con mucho aire, como susurrando. Mantén ese aire en los agudos y conecta lo mejor posible todas las notas. Puedes repetir con otras vocales.',
			en: 'Sing the notes tied together on an “AH” with plenty of air, as if whispering. Keep that air in the high notes and connect all the notes as smoothly as you can. You can repeat with other vowels.'
		}
	},
	{
		id: 'ligados-m',
		kind: 'focus',
		shape: 'sustained',
		goals: ['mix', 'pitch'],
		name: { es: 'Ligados con M aireada', en: 'Breathy M legato' },
		how: {
			es: 'Haz las notas ligadas con una «M» con aire. Mantén ese aire en los agudos y conecta lo mejor posible todas las notas.',
			en: 'Sing the notes tied together on an “M” with some air. Keep that air in the high notes and connect all the notes as smoothly as you can.'
		}
	},
	{
		id: 'ia',
		kind: 'focus',
		shape: 'agile',
		goals: ['mix', 'high'],
		name: { es: 'Agilidad con IA', en: 'Agility on IA' },
		how: {
			es: 'Haz las escalas con agilidad vocal, con la sílaba «IA» en cada nota.',
			en: 'Sing the scales with vocal agility, on the syllable “EE-AH” for each note.'
		}
	},
	{
		id: 'la-ja',
		kind: 'focus',
		shape: 'high',
		goals: ['high'],
		name: { es: 'LA-JA-JA', en: 'LA-JA-JA' },
		how: {
			es: 'Haz «LA» en la primera nota y «JA» en las demás, mirando hacia arriba (unos 45°) con la boca en sonrisa, bien abierta en horizontal. Trata de llegar lo más arriba posible con registro fuerte, sin mover la mandíbula. Repite con «LE-JE».',
			en: 'Sing “LAH” on the first note and “HAH” on the others, looking up (about 45°) with your mouth in a smile, wide open horizontally. Try to reach as high as possible in strong register without moving the jaw. Repeat with “LEH-HEH”.'
		}
	},
	{
		id: 'sin-aire-m',
		kind: 'focus',
		shape: 'sustained',
		goals: ['sustain'],
		name: { es: 'Sin tomar aire con M', en: 'One breath on M' },
		how: {
			es: 'Haz la escala con la sílaba «MAM» después de tomar aire profundo, cambiando de vocal en cada subida de tono («MEM», «MIM»…). No tomes aire ni cortes la emisión, y trata de llegar lo más arriba posible. Cuando se acabe el aire, vuelve a empezar e intenta llegar más lejos que antes.',
			en: 'Sing the scale on “MAM” after taking a deep breath, changing the vowel on each step up (“MEM”, “MEEM”…). Do not take a breath or cut the sound, and try to get as high as you can. When the air runs out, start again and try to get further than before.'
		}
	},
	{
		id: 'ki-ku',
		kind: 'focus',
		shape: 'sustained',
		goals: ['sustain'],
		name: { es: 'KI y KU sin tomar aire', en: 'KI and KU in one breath' },
		how: {
			es: 'Haz la escala con la sílaba «KI» o «KU» después de tomar aire profundo. No tomes aire ni cortes la emisión, y trata de llegar lo más arriba posible. Cuando se acabe el aire, vuelve a empezar e intenta llegar más lejos que antes.',
			en: 'Sing the scale on “KEE” or “KOO” after taking a deep breath. Do not take a breath or cut the sound, and try to get as high as you can. When the air runs out, start again and try to get further than before.'
		}
	}
];

const BY_ID = new Map(TECHNIQUES.map((t) => [t.id, t]));

export function techniqueById(id: string): Technique | undefined {
	return BY_ID.get(id);
}

export function techniqueText(t: Technique, lang: 'es' | 'en'): { name: string; how: string } {
	return { name: t.name[lang], how: t.how[lang] };
}
