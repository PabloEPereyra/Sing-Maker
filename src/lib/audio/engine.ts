// Motor de audio: contexto compartido, piano (muestra única desde A1) con respaldo sintético,
// metrónomo y programación de notas sobre el reloj del AudioContext.
// Simplificado a partir de vocalizator/src/scripts/audio.ts (solo un piano muestreado, como en Voicexplorer, y el sintetizador).
//
// Las voces (nota, golpe, clic) se dibujan en cualquier BaseAudioContext, así que sirven tanto para
// sonar en vivo como para renderizar la pista completa sin conexión (ver `AudioRecorder`).

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
let reverbWet: GainNode | null = null;
let recordingTap: MediaStreamAudioDestinationNode | null = null;

/** Cadena de salida: volumen general y una reverb corta (ruido con caída exponencial). */
function buildChain(c: BaseAudioContext, volume: number): { master: GainNode; wet: GainNode } {
	const out = c.createGain();
	out.gain.value = volume;
	const reverb = c.createConvolver();
	const len = Math.floor(c.sampleRate * 1.8);
	const ir = c.createBuffer(2, len, c.sampleRate);
	for (let ch = 0; ch < 2; ch++) {
		const data = ir.getChannelData(ch);
		for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
	}
	reverb.buffer = ir;
	const wet = c.createGain();
	wet.gain.value = 0.18;
	out.connect(c.destination);
	out.connect(reverb);
	reverb.connect(wet);
	wet.connect(c.destination);
	return { master: out, wet };
}

export function getContext(): AudioContext {
	if (!ctx) {
		ctx = new AudioContext({ latencyHint: 'interactive' });
		({ master, wet: reverbWet } = buildChain(ctx, 0.6));
	}
	if (ctx.state === 'suspended') void ctx.resume();
	return ctx;
}

/** Solo desarrollo (grabador de video en vivo): copia de todo lo que suena, sin tocar la salida normal. */
export function getRecordingAudio(): MediaStream {
	const c = getContext();
	if (!recordingTap) {
		recordingTap = c.createMediaStreamDestination();
		master!.connect(recordingTap);
		reverbWet!.connect(recordingTap);
	}
	return recordingTap.stream;
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

// ---------- voces (sirven en vivo y sin conexión) ----------

function voiceNote(
	c: BaseAudioContext,
	out: AudioNode,
	midi: number,
	t: number,
	duration: number,
	velocity: number
): AudioScheduledSourceNode {
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
		g.connect(out);
		src.start(t, offset, len);
		return src;
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
	g.connect(out);
	osc.start(t);
	osc.stop(t + duration + 0.15);
	return osc;
}

function voiceTick(
	c: BaseAudioContext,
	out: AudioNode,
	when: number,
	accent: boolean
): AudioScheduledSourceNode {
	const osc = c.createOscillator();
	osc.type = 'square';
	osc.frequency.value = accent ? 1600 : 1100;
	const g = c.createGain();
	g.gain.setValueAtTime(0.25, when);
	g.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
	osc.connect(g);
	g.connect(out);
	osc.start(when);
	osc.stop(when + 0.06);
	return osc;
}

/** Programa una nota en el instante `when` (reloj del AudioContext). */
export function playNote(midi: number, when: number, duration: number, velocity = 0.8): void {
	const c = getContext();
	track(voiceNote(c, master!, midi, Math.max(when, c.currentTime), duration, velocity));
}

// ---------- batería ----------
// Muestra única con todos los golpes (de vocalizator): cada instrumento en un tramo, con variantes.
const DRUMS_URL = 'https://singapp.b-cdn.net/samples/drums/drumset.m4a';
const DRUM_SLICES: Record<string, { offset: number; len: number }[]> = {
	kick: [
		{ offset: 0, len: 0.45 },
		{ offset: 2, len: 0.45 }
	],
	snare: [
		{ offset: 4, len: 0.45 },
		{ offset: 6, len: 0.45 }
	],
	hihatClosed: [
		{ offset: 8, len: 0.35 },
		{ offset: 10, len: 0.35 }
	],
	hihatOpen: [
		{ offset: 12, len: 0.8 },
		{ offset: 14, len: 0.8 }
	],
	ride: [{ offset: 16, len: 0.8 }],
	splash: [{ offset: 18, len: 1.4 }]
};
let drumsBuffer: AudioBuffer | null = null;
let drumsLoading: Promise<void> | null = null;

export function loadDrums(): Promise<void> {
	if (drumsBuffer) return Promise.resolve();
	drumsLoading ??= (async () => {
		try {
			const res = await fetch(DRUMS_URL, { mode: 'cors' });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			drumsBuffer = await getContext().decodeAudioData(await res.arrayBuffer());
		} catch (e) {
			console.warn('Batería no disponible', e);
			drumsLoading = null;
		}
	})();
	return drumsLoading;
}

/** Elige una variante del golpe (al azar), o null si ese instrumento no existe. */
function pickDrumVariant(part: string): number {
	const variants = DRUM_SLICES[part];
	return variants ? Math.floor(Math.random() * variants.length) : -1;
}

function voiceDrum(
	c: BaseAudioContext,
	out: AudioNode,
	part: string,
	variant: number,
	when: number,
	accent: boolean
): AudioScheduledSourceNode | null {
	const v = DRUM_SLICES[part]?.[variant];
	if (!drumsBuffer || !v) {
		// Sin la muestra cargada, el bombo y la caja caen en un clic.
		return part === 'kick' || part === 'snare' ? voiceTick(c, out, when, accent) : null;
	}
	const src = c.createBufferSource();
	src.buffer = drumsBuffer;
	const g = c.createGain();
	g.gain.value =
		(part === 'splash' ? 0.5 : part.startsWith('hihat') ? 0.55 : 0.75) * (accent ? 1.1 : 1);
	src.connect(g);
	g.connect(out);
	src.start(when, v.offset, v.len);
	return src;
}

/** Golpe de batería en `when`; sin la muestra cargada, el bombo y la caja caen en un clic. */
export function playDrum(part: string, when: number, accent = false): void {
	const c = getContext();
	const node = voiceDrum(
		c,
		master!,
		part,
		pickDrumVariant(part),
		Math.max(when, c.currentTime),
		accent
	);
	if (node) track(node);
}

/** Clic de metrónomo; `accent` para el primer tiempo. */
export function tick(when: number, accent = false): void {
	const c = getContext();
	track(voiceTick(c, master!, when, accent));
}

export function stopAll(): void {
	for (const n of scheduled) {
		try {
			n.stop();
		} catch {}
	}
	scheduled = [];
}

// ---------- salida de audio del juego (en vivo o grabada) ----------

/** Lo que el juego necesita del audio: un reloj y las voces. */
export interface AudioOut {
	now(): number;
	note(midi: number, when: number, duration: number, velocity?: number): void;
	drum(part: string, when: number, accent?: boolean): void;
	tick(when: number, accent?: boolean): void;
	stopAll(): void;
}

/** Sonido real, por el AudioContext compartido. */
export const liveAudio: AudioOut = {
	now: () => getContext().currentTime,
	note: playNote,
	drum: playDrum,
	tick,
	stopAll
};

type AudioEvent =
	| { kind: 'note'; when: number; midi: number; duration: number; velocity: number }
	| { kind: 'drum'; when: number; part: string; variant: number; accent: boolean }
	| { kind: 'tick'; when: number; accent: boolean };

/**
 * Reloj virtual y registro de lo que "sonaría": en vez de tocar, anota cada evento para luego
 * renderizar la pista completa más rápido que el tiempo real (`render`).
 */
export class AudioRecorder implements AudioOut {
	/** Tiempo virtual (s); lo avanza quien simula (cada cuadro de video). */
	time = 0;
	private events: AudioEvent[] = [];

	now = () => this.time;
	advance(dt: number): void {
		this.time += dt;
	}
	note(midi: number, when: number, duration: number, velocity = 0.8): void {
		this.events.push({ kind: 'note', when, midi, duration, velocity });
	}
	drum(part: string, when: number, accent = false): void {
		this.events.push({ kind: 'drum', when, part, variant: pickDrumVariant(part), accent });
	}
	tick(when: number, accent = false): void {
		this.events.push({ kind: 'tick', when, accent });
	}
	stopAll(): void {}

	/** Renderiza todo lo registrado en `seconds` de audio estéreo (hace falta tener piano y batería cargados). */
	async render(seconds: number, sampleRate = 48000): Promise<AudioBuffer> {
		const c = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
		const { master: out } = buildChain(c, master?.gain.value ?? 0.6);
		for (const e of this.events) {
			if (e.kind === 'note') voiceNote(c, out, e.midi, Math.max(0, e.when), e.duration, e.velocity);
			else if (e.kind === 'drum')
				voiceDrum(c, out, e.part, e.variant, Math.max(0, e.when), e.accent);
			else voiceTick(c, out, Math.max(0, e.when), e.accent);
		}
		return c.startRendering();
	}
}
