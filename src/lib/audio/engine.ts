// Motor de audio: contexto compartido, piano (muestra única desde A1) con respaldo sintético,
// metrónomo y programación de notas sobre el reloj del AudioContext.
// Simplificado a partir de vocalizator/src/scripts/audio.ts (solo un piano muestreado, como en Voicexplorer, y el sintetizador).

import { midiToFreq } from '$lib/music/notes';

const PIANO_URL = 'https://singapp.b-cdn.net/samples/instruments/piano-hammersmith.m4a';
const PIANO_BASE_MIDI = 33; // A1
const PIANO_MAX_MIDI = 96; // C7
const PIANO_STEP_SEC = 2; // cada nota ocupa 2 s en la muestra

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let pianoBuffer: AudioBuffer | null = null;
let pianoLoading: Promise<void> | null = null;
let scheduled: AudioScheduledSourceNode[] = [];

export function getContext(): AudioContext {
	if (!ctx) {
		ctx = new AudioContext({ latencyHint: 'interactive' });
		master = ctx.createGain();
		master.gain.value = 0.6;

		// Reverb corta generada por código (ruido con caída exponencial).
		const reverb = ctx.createConvolver();
		const len = Math.floor(ctx.sampleRate * 1.8);
		const ir = ctx.createBuffer(2, len, ctx.sampleRate);
		for (let ch = 0; ch < 2; ch++) {
			const data = ir.getChannelData(ch);
			for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
		}
		reverb.buffer = ir;
		const wet = ctx.createGain();
		wet.gain.value = 0.18;
		master.connect(ctx.destination);
		master.connect(reverb);
		reverb.connect(wet);
		wet.connect(ctx.destination);
	}
	if (ctx.state === 'suspended') void ctx.resume();
	return ctx;
}

export function now(): number {
	return getContext().currentTime;
}

export function setVolume(v: number): void {
	getContext();
	master!.gain.value = v;
}

export function loadPiano(): Promise<void> {
	if (pianoBuffer) return Promise.resolve();
	if (!pianoLoading) {
		pianoLoading = (async () => {
			try {
				const res = await fetch(PIANO_URL, { mode: 'cors' });
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				pianoBuffer = await getContext().decodeAudioData(await res.arrayBuffer());
			} catch (e) {
				console.warn('Piano no disponible, uso sintetizador', e);
			}
		})();
	}
	return pianoLoading;
}

export function isPianoReady(): boolean {
	return pianoBuffer !== null;
}

function track(node: AudioScheduledSourceNode): void {
	scheduled.push(node);
	node.onended = () => {
		scheduled = scheduled.filter((n) => n !== node);
	};
}

/** Programa una nota en el instante `when` (reloj del AudioContext). */
export function playNote(midi: number, when: number, duration: number, velocity = 0.8): void {
	const c = getContext();
	const t = Math.max(when, c.currentTime);
	if (pianoBuffer) {
		const m = Math.max(PIANO_BASE_MIDI, Math.min(PIANO_MAX_MIDI, Math.round(midi)));
		const offset = (m - PIANO_BASE_MIDI) * PIANO_STEP_SEC;
		const src = c.createBufferSource();
		src.buffer = pianoBuffer;
		const g = c.createGain();
		const len = Math.min(PIANO_STEP_SEC - 0.05, Math.max(0.15, duration + 0.25));
		g.gain.setValueAtTime(velocity, t);
		g.gain.setValueAtTime(velocity, t + len - 0.12);
		g.gain.linearRampToValueAtTime(0, t + len);
		src.connect(g);
		g.connect(master!);
		src.start(t, offset, len);
		track(src);
		return;
	}
	// Respaldo: triángulo con envolvente suave.
	const osc = c.createOscillator();
	osc.type = 'triangle';
	osc.frequency.value = midiToFreq(midi);
	const g = c.createGain();
	g.gain.setValueAtTime(0, t);
	g.gain.linearRampToValueAtTime(0.35 * velocity, t + 0.02);
	g.gain.exponentialRampToValueAtTime(0.12 * velocity, t + Math.max(0.05, duration * 0.6));
	g.gain.linearRampToValueAtTime(0, t + duration + 0.1);
	osc.connect(g);
	g.connect(master!);
	osc.start(t);
	osc.stop(t + duration + 0.15);
	track(osc);
}

/** Clic de metrónomo; `accent` para el primer tiempo. */
export function tick(when: number, accent = false): void {
	const c = getContext();
	const osc = c.createOscillator();
	osc.type = 'square';
	osc.frequency.value = accent ? 1600 : 1100;
	const g = c.createGain();
	g.gain.setValueAtTime(0.25, when);
	g.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
	osc.connect(g);
	g.connect(master!);
	osc.start(when);
	osc.stop(when + 0.06);
	track(osc);
}

export function stopAll(): void {
	for (const n of scheduled) {
		try {
			n.stop();
		} catch {}
	}
	scheduled = [];
}
