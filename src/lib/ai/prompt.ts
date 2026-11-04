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

/** Reglas del compás elegido por la persona. */
function meterRules(meter?: '4/4' | '6/8'): string {
	if (meter === '6/8')
		return `
Time signature: 6/8 (REQUIRED).
- "beatsPerMeasure": 6. Durations are still written in quarter beats: eighth 0.5, dotted quarter 1.5,
  dotted half 3. A 6/8 measure lasts 3 beats (six eighths), felt as two dotted quarters (1.5 + 1.5).
- Write lilting compound rhythms: groups of three eighths (0.5 0.5 0.5), dotted quarters, quarter + eighth
  (1 0.5). Avoid patterns that only make sense in 4/4.
- The guide note is { "d": 1.5, "s": 0, "hint": true } (or 3).
- The TOTAL of all durations, guide note included, must be a multiple of 3.`;
	if (meter === '4/4')
		return `
Time signature: 4/4 (REQUIRED).
- "beatsPerMeasure": 4. The TOTAL of all durations, guide note included, must be a multiple of 4
  (lengthen the last held note if needed).`;
	return '';
}

export function systemPrompt(lang: 'es' | 'en', range?: VoiceRange, meter?: '4/4' | '6/8'): string {
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
- Prefer patterns whose total beats fill whole measures: "beatsPerMeasure" 2, 3 or 4 are x/4 measures of
  that many beats; 6 means 6/8, a measure of 3 beats (six eighths).${meterRules(meter)}
- "bpm" between 40 and 160. "syllable": the vowel or syllable to sing (e.g. "a", "mm", "rr", "nu").

Musical content:
- Match the request (scale, arpeggio, leaps, melisma, staccato, legato, style…) with idiomatic, singable lines.
  Respect the melodic direction asked for inside the pattern (e.g. "descending thirds" must go down).
- If the request does not fit these limits or the singer's range, write the closest version that fits and
  say what changed in "description" (e.g. "one octave instead of two to fit your range"). "name" must
  describe what was actually written, not the original request.
- If a famous singer or style is mentioned, describe the style with ORIGINAL material: never quote real songs
  or copyrighted melodies. (Transcribing a score image that the user uploads is different: then copy exactly
  what is printed.)
- "name": short and clear. "description": "<type> | <scale degrees> | <rhythm>" like the examples.
- Write "name", "description" and "ask" (when you must ask something) in ${language}.`;
}

/** Nombre que devuelve el modelo cuando la imagen no tiene una partitura legible. */
export const NO_SCORE = 'NO_SCORE';

/** Pedido para leer la imagen: una partitura impresa o escrita a mano, o un dibujo de la melodía (va junto con la imagen). */
export function scoreInstruction(extra: string): string {
	return `Turn the melody in this image into ONE exercise, with the same JSON as always plus four fields: "reading" (written first), "kind" ("score" for music notation, "drawing" for a hand drawing of blocks), "clef" and "ask".
First decide what the image is.

A) SCORE (printed or handwritten notation) - "kind": "score".
- Set "clef": "treble", "bass" or "other" (the clef of the staff you transcribe); "ask": null.
- Read the clef, key signature, time signature and accidentals first. Treble clef: bottom line E4, lines
  E4 G4 B4 D5 F5, spaces F4 A4 C5 E5, D4 just below the bottom line, C4 on the first ledger line below. Bass clef: lines G2 B2 D3 F3 A3,
  spaces A2 C3 E3 G3, C4 on the first ledger line above. Accidentals last until the bar line.
- FIRST fill "reading" (it comes before "notes" in the JSON): one line per measure, left to right, like
  "m1: dotted eighth C4 (ledger line below the staff, 0.75) + sixteenth C4 (0.25) = 1 of 3 beats (pickup)".
  For each note say its figure, its pitch with the octave and where it sits on the staff (line or space,
  counting from the bottom line = line 1, or ledger line), its beats, and the measure total. Then copy
  "reading" exactly into "notes": do not change a pitch or a duration after writing it there.
- Go left to right: ONE entry per printed note or rest, never repeat, skip or invent notes. Read every
  measure to the end of the image; do not stop after the first phrase.
- Durations in quarter-note beats: whole 4, half 2, quarter 1, eighth 0.5, sixteenth 0.25; a dot adds half.
  A dotted eighth followed by a sixteenth (joined by a beam) is 0.75 + 0.25 = 1 beat.
  Tied notes become one longer note (split it if it is longer than 4). Rests use "rest": true.
- Add up the beats of every measure. A complete measure must equal the time signature: re-read it if not.
  The FIRST measure (and the last) may be incomplete: that is a pickup (anacrusis). Do not fill it with
  rests or invent notes; write only what is printed. A measure with blank space and no printed rest is
  also written as just its printed notes.
- Ignore anything that is not a note, rest, clef, key or time signature: logos, watermarks, decorations,
  page numbers, lyrics, chord symbols.
- "beatsPerMeasure" from the time signature in quarter beats: 4/4 -> 4, 3/4 -> 3, 2/4 -> 2, 6/8 -> 3.
- "bpm" from the tempo marking if there is one, otherwise 80.
- Take only the main melody (the vocal line or the top voice); ignore lyrics, chord symbols and other staves.

B) DRAWING (rectangles or bars on a page, with or without words) - "kind": "drawing".
- Read it left to right: ONE block = ONE note. Set "clef": null.
- HEIGHT is pitch: a block drawn higher is a higher note; blocks at the same height are the same note.
- WIDTH is duration: compare the widths with each other and keep their proportions (a block twice as wide lasts twice as long; for example 0.5 : 1 : 2). Pick the base so the shortest block is 0.5 or 1 beat and the whole thing is about 4 to 16 beats.
- The normal spacing between blocks is NOT a rest. Add a rest only when the drawing marks one on purpose (a block labelled R or "silencio", an empty dashed block, a pause sign).
- A word written above or beside a block is its note name: DO RE MI FA SOL LA SI = C D E F G A B (also letters; "b" or "#" after it are accidentals). When the blocks have names, use them (and the heights only to choose the octave).
- Without names: the steps follow the scale or key the user names (e.g. "en do mayor", "in A minor"): consecutive heights are consecutive degrees of that scale; do not skip degrees. If the user names no scale or key, set "ask" to ONE short question asking in which key or scale to read the drawing (only the scale type really matters: the app moves the exercise to the singer's range), and still fill the notes with your best guess in a major scale. In every other case "ask" is null.
- A drawing has no time signature: "beatsPerMeasure" 4 and "bpm" 80, unless the user says otherwise.
- "name": a short description of the melody (use the user's title if there is one).

For BOTH:
- For every sung note write "n": its pitch with the octave (e.g. "F3", "Bb3", "C#4"). In a score name each note from its own line or space on the staff, not by counting intervals. In a drawing put the first note in octave 4 and go up or down as the drawing does. The app computes the intervals from "n"; still fill "s" = semitones from the first sung note.
- Start with the guide note { "d": 2, "s": 0, "hint": true } (1.5 in 6/8), then the notes.
- If it does not fit the limits (64 notes, the semitone span), keep only the first part that fits and say so in "description".
- "name": the printed title if there is one, otherwise a short description of the melody.
- If the image has neither readable notation nor a readable drawing of a melody, answer with "name": "${NO_SCORE}" and two placeholder notes.${
		extra ? `\n\nThe user adds: ${extra}` : ''
	}`;
}

export function exampleMessages(): { role: 'user' | 'assistant'; content: string }[] {
	return EXAMPLES.flatMap((e) => [
		{ role: 'user' as const, content: e.request },
		{ role: 'assistant' as const, content: JSON.stringify(e.exercise) }
	]);
}
