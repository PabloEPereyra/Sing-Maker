// Escuchar un patrón una vez (antes de practicarlo): lo toca el piano sobre una raíz cómoda.
import type { ParsedNote } from '$lib/music/parser';
import { hitsAt, patternSteps, type DrumPattern } from './drums';
import { getContext, loadDrums, loadPiano, playDrum, playNote, stopAll } from './engine';

/** Raíz que deja el patrón centrado en el rango de la voz. */
export function previewRoot(notes: ParsedNote[], low: number, high: number): number {
	const offsets = notes.filter((n) => !n.isRest).map((n) => n.semitones);
	const lo = Math.min(0, ...offsets);
	const hi = Math.max(0, ...offsets);
	return Math.round((low + high) / 2 - (lo + hi) / 2);
}

/**
 * Toca el patrón desde `root`, sin la nota guía (se escucha solo al practicar) y arrancando directo en
 * la primera nota a cantar. Devuelve una promesa que se resuelve al terminar (o al cortarlo con
 * `stopPreview`).
 */
export async function playPattern(notes: ParsedNote[], bpm: number, root: number): Promise<void> {
	stopPreview();
	await Promise.race([loadPiano(), new Promise((r) => setTimeout(r, 1500))]);
	const ctx = getContext();
	const beat = 60 / bpm;
	const t0 = ctx.currentTime + 0.1;
	let beats = 0;
	for (const n of notes) {
		if (n.isHint) continue;
		if (!n.isRest)
			playNote(
				root + n.semitones,
				t0 + beats * beat,
				(n.staccato ? n.duration * 0.5 : n.duration) * beat,
				0.7
			);
		beats += n.duration;
	}
	return new Promise((resolve) => {
		finish = resolve;
		timer = setTimeout(() => stopPreview(), (beats * beat + 0.3) * 1000);
	});
}

/** Toca un patrón de batería `loops` veces a `bpm` (el pulso es el del compás del patrón). */
export async function playDrumPattern(p: DrumPattern, bpm: number, loops = 2): Promise<void> {
	stopPreview();
	await Promise.race([loadDrums(), new Promise((r) => setTimeout(r, 1500))]);
	const ctx = getContext();
	const stepSec = ((p.meter === '6/8' ? 0.5 : 1) * 60) / bpm / p.stepsPerTick;
	const t0 = ctx.currentTime + 0.1;
	const steps = patternSteps(p) * loops;
	for (let k = 0; k < steps; k++)
		for (const part of hitsAt(p, k)) playDrum(part, t0 + k * stepSec, k % patternSteps(p) === 0);
	return new Promise((resolve) => {
		finish = resolve;
		timer = setTimeout(() => stopPreview(), (steps * stepSec + 0.5) * 1000);
	});
}

let timer: ReturnType<typeof setTimeout> | null = null;
let finish: (() => void) | null = null;

export function stopPreview(): void {
	if (timer) clearTimeout(timer);
	timer = null;
	if (finish) {
		stopAll();
		finish();
		finish = null;
	}
}
