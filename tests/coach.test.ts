import { describe, expect, it } from 'vitest';
import { settle, type CoachRequest } from '../src/lib/ai/coach';
import { analyzePerformance, type PitchSample, type Star } from '../src/lib/game/scoring';

/** Estrellas de 2 repeticiones sobre dos notas (60 y 67) cada 0,5 s. */
function stars(hit: (rep: number, midi: number, i: number) => boolean): Star[] {
	const out: Star[] = [];
	for (let rep = 0; rep < 4; rep++)
		for (let i = 0; i < 6; i++) {
			const midi = i % 2 ? 67 : 60;
			out.push({
				noteId: rep * 6 + i,
				rep,
				time: rep * 3 + i * 0.5,
				midi,
				state: hit(rep, midi, i) ? 'collected' : 'missed',
				changedAt: 0
			});
		}
	return out;
}

/** Voz que sigue cada estrella con un desvío fijo (en semitonos). */
const voiceAt = (list: Star[], offset: number): PitchSample[] =>
	list.flatMap((s) => [
		{ time: s.time - 0.05, midi: s.midi + offset },
		{ time: s.time, midi: s.midi + offset },
		{ time: s.time + 0.05, midi: s.midi + offset }
	]);

describe('analyzePerformance', () => {
	it('todo bien: 100 %, sin tendencia ni notas flojas', () => {
		const list = stars(() => true);
		const p = analyzePerformance(list, voiceAt(list, 0));
		expect(p).toMatchObject({ percent: 100, tendency: 'none', trend: 'steady', weakNotes: [] });
		expect(p.repPercents).toEqual([100, 100, 100, 100]);
	});

	it('detecta que se queda por debajo y cuál es la nota floja', () => {
		const list = stars((_, midi) => midi === 60);
		const p = analyzePerformance(list, voiceAt(list, -0.8));
		expect(p.percent).toBe(50);
		expect(p.tendency).toBe('low');
		expect(p.weakNotes).toEqual([{ midi: 67, percent: 0 }]);
		expect(p.lowPercent).toBe(100);
		expect(p.highPercent).toBe(0);
	});

	it('detecta que se pasa por arriba y cuenta los silencios', () => {
		const list = stars(() => false);
		expect(analyzePerformance(list, voiceAt(list, 0.7)).tendency).toBe('high');
		expect(analyzePerformance(list, []).silentMissPercent).toBe(100);
	});

	it('nota la evolución entre la primera y la segunda mitad', () => {
		const better = analyzePerformance(
			stars((rep) => rep >= 2),
			[]
		);
		const worse = analyzePerformance(
			stars((rep) => rep < 2),
			[]
		);
		expect(better.trend).toBe('up');
		expect(worse.trend).toBe('down');
	});
});

describe('settle (valida lo que contesta el modelo)', () => {
	const base = (percent: number): CoachRequest => ({
		lang: 'es',
		exercise: { id: 'a', name: 'A', level: '1', category: 'Escalas' },
		summary: {
			percent,
			stars: 40,
			reps: 4,
			repPercents: [],
			trend: 'steady',
			tendency: 'none',
			silentMissPercent: 0,
			lowPercent: 50,
			highPercent: 50,
			weakNotes: [],
			desynced: false
		},
		candidates: [
			{ id: 'b', name: 'B', level: '1', category: 'Escalas', description: '' },
			{ id: 'c', name: 'C', level: '2', category: 'Escalas', description: '' }
		]
	});
	const answer = (over: object) => ({
		message: ' Muy bien. ',
		action: 'exercise' as const,
		exerciseId: 'c',
		prompt: '',
		...over
	});

	it('respeta un ejercicio válido y marca el subir de nivel desde el 85 %', () => {
		expect(settle(answer({}), base(90))).toMatchObject({ exerciseId: 'c', levelUp: true });
		expect(settle(answer({}), base(84)).levelUp).toBe(false);
	});

	it('cambia un id inventado por uno de la lista (más difícil si subió de nivel)', () => {
		expect(settle(answer({ exerciseId: 'zzz' }), base(95)).exerciseId).toBe('c');
		expect(settle(answer({ exerciseId: 'zzz' }), base(50)).exerciseId).toBe('b');
	});

	it('crear sin descripción pasa a ninguna acción, y limpia los campos que no corresponden', () => {
		expect(settle(answer({ action: 'create', exerciseId: '' }), base(50)).action).toBe('none');
		const ok = settle(
			answer({ action: 'create', exerciseId: 'c', prompt: 'escala lenta' }),
			base(50)
		);
		expect(ok).toMatchObject({ action: 'create', exerciseId: '', prompt: 'escala lenta' });
	});
});

describe('biblioteca oculta', () => {
	it('trae 51 ejercicios que se leen bien y no repiten los del catálogo', async () => {
		const { exercises, library } = await import('../src/lib/exercises/catalog');
		expect(library).toHaveLength(51);
		const visible = new Set(exercises.map((e) => e.id));
		for (const e of library) {
			expect(visible.has(e.id)).toBe(false);
			expect(e.parsed.notes.length).toBeGreaterThan(0);
			expect(e.name + e.name_en + e.code).not.toContain('�');
			expect(Number(e.level)).toBeGreaterThanOrEqual(2);
		}
		expect(new Set(library.map((e) => e.id)).size).toBe(51);
	});

	it('todos arman una secuencia jugable', async () => {
		const { library } = await import('../src/lib/exercises/catalog');
		const { generateSequence } = await import('../src/lib/music/generate');
		for (const e of library) {
			const seq = generateSequence(e.parsed.notes, {
				low: 45,
				high: 72,
				direction: e.parsed.meta.direction,
				bpm: 90,
				beatsPerMeasure: e.parsed.meta.beatsPerMeasure,
				subdivision: e.parsed.meta.subdivision
			});
			expect(seq.notes.length, e.name).toBeGreaterThan(0);
		}
	});
});
