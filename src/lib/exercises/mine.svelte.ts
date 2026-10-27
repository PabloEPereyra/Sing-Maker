// Ejercicios propios (creados con IA), guardados en el navegador.
import { parse } from '$lib/music/parser';
import type { Exercise } from './catalog';

const KEY = 'singmaker-my-exercises';

interface Stored {
	id: string;
	code: string;
	prompt: string;
	created: number;
}

export const mine = $state<{ list: Exercise[] }>({ list: [] });
let stored: Stored[] = [];

function toExercise(s: Stored): Exercise {
	const parsed = parse(s.code);
	return {
		id: s.id,
		name: parsed.meta.name,
		name_en: parsed.meta.name,
		description_en: parsed.meta.description,
		category: 'mine',
		level: 'mine',
		code: s.code,
		parsed
	};
}

export function loadMine(): void {
	try {
		stored = JSON.parse(localStorage.getItem(KEY) ?? '[]');
	} catch {
		stored = [];
	}
	mine.list = stored.map(toExercise);
}

function save(): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(stored));
	} catch {}
}

export function addMine(code: string, prompt: string): Exercise {
	const s: Stored = { id: `my-${Date.now().toString(36)}`, code, prompt, created: Date.now() };
	stored = [s, ...stored];
	save();
	const ex = toExercise(s);
	mine.list = [ex, ...mine.list];
	return ex;
}

export function removeMine(id: string): void {
	stored = stored.filter((s) => s.id !== id);
	save();
	mine.list = mine.list.filter((e) => e.id !== id);
}
