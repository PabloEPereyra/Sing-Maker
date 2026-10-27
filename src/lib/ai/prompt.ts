// Prompt para generar ejercicios desde texto. El modelo compone el patrón relativo a la raíz;
// la app lo transpone por todo el rango de la persona (no hace falta que el modelo conozca notas
// absolutas). Ejemplos tomados del catálogo propio (vocalizator), convertidos a JSON.
import type { GeneratedExercise, VoiceRange } from './exercise';

const EXAMPLES: { request: string; exercise: GeneratedExercise }[] = [
	{
		request: 'Escala mayor de 5 notas en corcheas, subiendo y bajando',
		exercise: {
			name: 'Escala mayor 5 notas',
			description: 'Escala mayor | 1-2-3-4-5-4-3-2-1 | corcheas',
			bpm: 60,
			beatsPerMeasure: 4,
			direction: 'asc',
			syllable: 'rr',
			notes: [
				{ d: 2, s: 0, hint: true },
				{ d: 0.5, s: 0 },
				{ d: 0.5, s: 2 },
				{ d: 0.5, s: 4 },
				{ d: 0.5, s: 5 },
				{ d: 0.5, s: 7 },
				{ d: 0.5, s: 5 },
				{ d: 0.5, s: 4 },
				{ d: 0.5, s: 2 },
				{ d: 2, s: 0 }
			]
		}
	},
	{
		request: 'Major arpeggio 1-5-3-8 in 6/8',
		exercise: {
			name: 'Major arpeggio 1538',
			description: 'Major arpeggio | 1-5-3-8-5-3-1 | eighths | 6/8',
			bpm: 60,
			beatsPerMeasure: 6,
			direction: 'asc',
			syllable: 'rr',
			notes: [
				{ d: 1.5, s: 0, hint: true },
				{ d: 0.5, s: 0 },
				{ d: 0.5, s: 7 },
				{ d: 0.5, s: 4 },
				{ d: 0.5, s: 12 },
				{ d: 0.5, s: 4 },
				{ d: 0.5, s: 7 },
				{ d: 1.5, s: 0 }
			]
		}
	},
	{
		request: 'Saltos de octava staccato',
		exercise: {
			name: 'Saltos de octava x2',
			description: 'Saltos de octava | 1-8-1-1-8-1 | corcheas staccato',
			bpm: 60,
			beatsPerMeasure: 4,
			direction: 'asc',
			syllable: 'ha',
			notes: [
				{ d: 2, s: 0, hint: true },
				{ d: 0.5, s: 0, staccato: true },
				{ d: 0.5, s: 12, staccato: true },
				{ d: 1, s: 0 },
				{ d: 0.5, s: 0, staccato: true },
				{ d: 0.5, s: 12, staccato: true },
				{ d: 1, s: 0 }
			]
		}
	}
];

export function systemPrompt(lang: 'es' | 'en', range?: VoiceRange): string {
	const language = lang === 'es' ? 'Spanish (rioplatense is fine)' : 'English';
	const span = range ? range.high - range.low : null;
	return `You compose vocal warm-up exercises (vocalises) for experienced singers, voice students and teachers.
You are a composer of exercises, not a coach: never give medical or health advice.

Output ONE JSON object with this shape and nothing else:
{ "name": string, "description": string, "bpm": number, "beatsPerMeasure": number,
  "direction": "asc" | "desc", "syllable": string, "notes": [ { "d": number, "s": number, "rest"?: boolean, "hint"?: boolean,
  "legato"?: boolean, "staccato"?: boolean } ] }

How the app uses it:
- "notes" is ONE repetition of the pattern, written RELATIVE to a root note: "s" is semitones from the root
  (0 = root, 2 = major second, 4 = major third, 7 = fifth, 12 = octave, -5 = fourth below).
- The app repeats the pattern on every root that fits the singer's range, moving up a semitone each time
  ("direction": "asc") or down ("desc"). Do NOT write the transpositions yourself.
- "d" is the duration in beats: 0.25 sixteenth, 0.5 eighth, 1 quarter, 1.5 dotted quarter, 2 half, 4 whole.
  Use only multiples of 0.25, up to 4.
- Start with the root as a guide note the singer only hears: { "d": 2, "s": 0, "hint": true }
  (use 1.5 in 6/8). End the pattern on a held note, usually the root.
- "rest": true makes a silence of duration "d" ("s" is ignored).
- "legato": true slurs a note into the previous one (no new attack): use it when legato/ligado/slurred is asked.
- "staccato": true makes a short, detached note (sung for half its duration).
- Keep the whole pattern within ${Math.min(19, span ?? 19)} semitones from lowest to highest note.
- Prefer patterns whose total beats fill whole measures of "beatsPerMeasure" (2, 3, 4 or 6).
- "bpm" between 40 and 160. "syllable": the vowel or syllable to sing (e.g. "a", "mm", "rr", "nu").

Musical content:
- Match the request (scale, arpeggio, leaps, melisma, staccato, legato, style…) with idiomatic, singable lines.
  Respect the melodic direction asked for inside the pattern (e.g. "descending thirds" must go down).
- If the request does not fit these limits or the singer's range, write the closest version that fits and
  say what changed in "description" (e.g. "one octave instead of two to fit your range"). "name" must
  describe what was actually written, not the original request.
- If a famous singer or style is mentioned, describe the style with ORIGINAL material: never quote real songs
  or copyrighted melodies.
- "name": short and clear. "description": "<type> | <scale degrees> | <rhythm>" like the examples.
- Write "name" and "description" in ${language}.`;
}

export function exampleMessages(): { role: 'user' | 'assistant'; content: string }[] {
	return EXAMPLES.flatMap((e) => [
		{ role: 'user' as const, content: e.request },
		{ role: 'assistant' as const, content: JSON.stringify(e.exercise) }
	]);
}
