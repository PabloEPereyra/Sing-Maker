// Patrones de batería creados con IA, guardados en el navegador. Se suman a los de fábrica según el
// compás (ver drums.ts).
import { STEPS_PER_TICK, type DrumResult } from '$lib/ai/drums';
import type { DrumPattern } from './drums';
import type { MeterId } from '$lib/music/meter';

const KEY = 'singmaker-my-drums';

export const myDrums = $state<{ list: DrumPattern[] }>({ list: [] });

/** Descarta lo guardado que no tenga la forma esperada (editado a mano o de otra versión). */
function isPattern(p: unknown): p is DrumPattern {
	const d = p as DrumPattern;
	return (
		!!d &&
		typeof d.id === 'string' &&
		typeof d.name === 'string' &&
		(d.meter === '4/4' || d.meter === '6/8') &&
		typeof d.stepsPerTick === 'number' &&
		!!d.tracks &&
		Object.values(d.tracks).every((t) => typeof t === 'string' && /^[x.]+$/.test(t))
	);
}

export function loadMyDrums(): void {
	try {
		const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
		myDrums.list = Array.isArray(raw) ? raw.filter(isPattern) : [];
	} catch {
		myDrums.list = [];
	}
}

function save(): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(myDrums.list));
	} catch {}
}

export function addMyDrum(result: DrumResult, meter: MeterId): DrumPattern {
	const pattern: DrumPattern = {
		id: `my-drum-${Date.now().toString(36)}`,
		name: result.name,
		meter,
		stepsPerTick: STEPS_PER_TICK[meter],
		tracks: result.tracks
	};
	myDrums.list = [...myDrums.list, pattern];
	save();
	return pattern;
}

export function removeMyDrum(id: string): void {
	myDrums.list = myDrums.list.filter((p) => p.id !== id);
	save();
}
