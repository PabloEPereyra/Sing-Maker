// Agrega `name_en` y `description_en` al catálogo con reemplazos de frases (los nombres siguen
// patrones fijos). Correr después de cambiar exercises.json: node scripts/translate-exercises.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'src/lib/data/exercises.json';
const RULES = [
	[/Escala menor armónica al estilo bachiano/g, 'Bach-style harmonic minor scale'],
	[
		/Escala árabe extendida de 9 grados continuos en semicorcheas\./g,
		'Extended Arabic scale, 9 continuous degrees in sixteenths.'
	],
	[
		/Ejercicio para apertura, belting y precisión de afinación/g,
		'Exercise for openness, belting and pitch accuracy'
	],
	[/Ejercicio de agilidad vocal y melismas/g, 'Vocal agility and melisma exercise'],
	[/Ejercicios para melismas/g, 'Melisma exercises'],
	[
		/Sostén la nota con "mm" para practicar tu afinación/g,
		'Hold the note on "mm" to practice your tuning'
	],
	[/Menor bachiana/g, 'Bach minor'],
	[/Menor armónica/g, 'Harmonic minor'],
	[/Escala menor armónica/g, 'Harmonic minor scale'],
	[/Escala menor y mayor/g, 'Minor and major scale'],
	[/Arpegio menor y mayor/g, 'Minor and major arpeggio'],
	[/Escala menor\/mayor/g, 'Minor/major scale'],
	[/Arpegio menor\/mayor/g, 'Minor/major arpeggio'],
	[/Escala eólica \(menor natural\)/g, 'Aeolian scale (natural minor)'],
	[/Escala Jónica \(mayor\)/g, 'Ionian scale (major)'],
	[
		/Escala ([A-ZÁÉÍÓÚa-záéíóú]+ica|Lidia|Mixolidia|locria|Frigia|Dórica)/g,
		(_, m) => `${mode(m)} scale`
	],
	[/^(Frigia|Dórica|Eólica|Jónica|Lidia|Locria|Mixolidia|Árabe|Húngara)\b/g, (m) => mode(m)],
	[/Escala húngara/g, 'Hungarian scale'],
	[/Escala mayor/g, 'Major scale'],
	[/Escala menor/g, 'Minor scale'],
	[/Arpegio mayor/g, 'Major arpeggio'],
	[/Arpegio menor/g, 'Minor arpeggio'],
	[/Escala para practicar vibrato/g, 'Scale to practice vibrato'],
	[/Nota Sostenida/g, 'Sustained note'],
	[/Saltos de octava/g, 'Octave leaps'],
	[/Saltos de notas/g, 'Note leaps'],
	[/Saltos/g, 'Leaps'],
	[/Melismas/g, 'Melismas'],
	[/para agilidad vocal básica/g, 'for basic vocal agility'],
	[/para agilidad vocal/g, 'for vocal agility'],
	[/con agudo repetido/g, 'with repeated top note'],
	[/con agudo sostenido/g, 'with sustained top note'],
	[/en descenso con grave repetido/g, 'descending with repeated low note'],
	[/arpegio mayor en descenso/g, 'descending major arpeggio'],
	[/con saltos de 3ra-4ta/g, 'with 3rd-4th leaps'],
	[/con saltos de 3ra/g, 'with 3rd leaps'],
	[/con saltos/g, 'with leaps'],
	[/con repeticiones/g, 'with repetitions'],
	[/final en 3ra/g, 'ending on the 3rd'],
	[/final en 5ta/g, 'ending on the 5th'],
	[/doble bajada/g, 'double descent'],
	[/descendente/g, 'descending'],
	[/una octava y media/g, 'one and a half octaves'],
	[/dos octavas/g, 'two octaves'],
	[/\(2 octavas\)/g, '(2 octaves)'],
	[/(\d+) notas/g, '$1 notes'],
	[/(\d+) tonos/g, '$1 tones'],
	[/(\d+) grados/g, '$1 degrees'],
	[/en semicorcheas/g, 'in sixteenths'],
	[/en corcheas/g, 'in eighths'],
	[/corchea-semicorchea/g, 'eighth-sixteenth'],
	[/semicorcheas/g, 'sixteenths'],
	[/corcheas/g, 'eighths'],
	[/corchea/g, 'eighth'],
	[/blancas/g, 'half notes'],
	[/ y /g, ' and ']
];

const MODES = {
	Frigia: 'Phrygian',
	Dórica: 'Dorian',
	Eólica: 'Aeolian',
	eólica: 'Aeolian',
	Jónica: 'Ionian',
	Lidia: 'Lydian',
	Locria: 'Locrian',
	locria: 'Locrian',
	Mixolidia: 'Mixolydian',
	Árabe: 'Arabic',
	Húngara: 'Hungarian',
	húngara: 'Hungarian'
};
function mode(m) {
	return MODES[m] ?? m;
}

export function translate(text) {
	let out = text.trim();
	for (const [re, rep] of RULES) out = out.replace(re, rep);
	return out.replace(/\s+/g, ' ');
}

const data = JSON.parse(readFileSync(FILE, 'utf8'));
for (const e of data) {
	const desc = e.code.match(/@description:(.*)/)?.[1] ?? '';
	e.name_en = translate(e.name);
	e.description_en = translate(desc);
}
writeFileSync(FILE, JSON.stringify(data, null, '\t') + '\n');
for (const e of data) console.log(`${e.name_en}  ||  ${e.description_en}`);
