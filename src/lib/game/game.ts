// Motor del juego: tiempo, cámara, física del personaje, puntuación y dibujo vía Theme.
// El tiempo maestro es el reloj del AudioContext, así el piano y lo que se ve no se desfasan.
import { getContext, playDrum, playNote, stopAll, tick } from '$lib/audio/engine';
import { hitsAt, type DrumPattern } from '$lib/audio/drums';
import { measureBeats, tickBeats } from '$lib/music/meter';
import type { Sequence, TimedNote } from '$lib/music/generate';
import { midiToNote } from '$lib/music/notes';
import { COLLECTIBLES, type CollectibleSkin } from './collectibles';
import {
	bestShift,
	buildStars,
	HIT_WINDOW_SEC,
	isHit,
	looksDesynced,
	type PitchSample,
	type Star
} from './scoring';
import type { Theme } from './theme';

/** 'listen': antes de la cuenta suena una vez la primera repetición, con el personaje de frente. */
export type Phase = 'idle' | 'listen' | 'countin' | 'playing' | 'paused' | 'done';

/** Silencio entre la escucha previa y la cuenta. */
const LISTEN_GAP_SEC = 0.6;

/** Al reanudar se retrocede este tiempo para retomar con contexto. */
const RESUME_PREROLL_SEC = 1;

export interface GameOptions {
	bpm: number;
	/** Pulsos del metrónomo por compás (4 en 4/4, 6 en 6/8). */
	beatsPerMeasure: number;
	/** Figura del pulso: 4 = negra, 8 = corchea (6/8). */
	subdivision: number;
	/** Patrón de batería que suena durante el ejercicio (la cuenta previa siempre es con clics). */
	drums: DrumPattern | null;
	/** La batería va a la mitad de velocidad: cada paso del patrón dura el doble. */
	drumsHalf: boolean;
	/** El piano toca las notas a cantar (las guías suenan siempre). */
	guide: boolean;
	/** Tolerancia en semitonos para recoger una estrella. */
	tolerance: number;
}

export interface GameStatus {
	phase: Phase;
	collected: number;
	missed: number;
	total: number;
	rep: number;
	reps: number;
	root: string;
	progress: number;
	/** Tiempos restantes de la cuenta previa, o null. */
	countIn: number | null;
	sungMidi: number | null;
}

/** Devuelve el tono cantado (MIDI, fraccionario) o null. Recibe el tiempo del ejercicio. */
export type PitchSource = (time: number) => number | null;

/** Duración (s) de la estela de viento detrás del personaje, al tempo de referencia. */
const TRAIL_SEC = 1.6;
/** Tempo en que el avance y las animaciones van a velocidad 1; más rápido o lento escala. */
const REF_BPM = 80;
const LOOKAHEAD_SEC = 0.35;

// Caminante (movement 'walk'), en semitonos y segundos.
/** Silencio tolerado antes de caer (respiraciones cortas, staccato). */
const COYOTE_SEC = 0.22;
/** Gravedad de la caída al suelo, en semitonos/s². */
const GRAVITY = 70;
/** Diferencia mínima con la altura actual para saltar en vez de acomodarse. */
const JUMP_MIN = 0.4;

interface Jump {
	from: number;
	to: number;
	t: number;
	dur: number;
	/** Altura extra del arco sobre la recta entre `from` y `to`. */
	peak: number;
}

export class Game {
	private g: CanvasRenderingContext2D;
	private w = 0;
	private h = 0;
	private dpr = 1;
	private resizeObserver: ResizeObserver;
	private raf = 0;
	private lastFrame = 0;

	private seq: Sequence = { notes: [], reps: [], duration: 0 };
	private opts: GameOptions = {
		bpm: 80,
		beatsPerMeasure: 4,
		subdivision: 4,
		drums: null,
		drumsHalf: false,
		guide: true,
		tolerance: 0.6
	};
	private stars: Star[] = [];
	private history: PitchSample[] = [];
	/** Todas las lecturas de la corrida (el historial de arriba solo guarda los últimos segundos). */
	private run: PitchSample[] = [];
	/** Zoom pedido y zoom mostrado (se acerca de a poco para que el cambio sea suave). */
	private zoomTarget = 1;
	private zoomNow = 1;
	private desynced = false;
	private phase: Phase = 'idle';
	private t0 = 0; // tiempo del AudioContext en que empieza el ejercicio
	private latency = 0;
	private source: PitchSource | null = null;
	private nextNoteToSchedule = 0;
	private nextBeatToSchedule = 0;
	private nextDrumStep = 0;
	private pausedAt = 0;
	/** Tiempo del AudioContext en que termina la escucha previa. */
	private listenEnd = 0;

	private birdMidi = 60;
	private birdVy = 0;
	/** Antes de pulsar play el personaje espera en el suelo; despega al empezar. */
	private grounded = true;
	private sung: number | null = null;
	/** Tiempo del ejercicio del último cuadro con tono (para saber sobre qué nota se está). */
	private now = 0;
	private jump: Jump | null = null;
	private fallV = 0;
	private silentFor = 0;
	private airborne = false;
	private sinceLanding = 1;
	private camCenter = 60;
	private camSpan = 14;
	private lastStatusKey = '';
	/** Reloj de las animaciones (s): corre más rápido cuanto más rápido es el tempo. */
	private animClock = 0;
	private collectible: CollectibleSkin = COLLECTIBLES.stars;

	constructor(
		private canvas: HTMLCanvasElement,
		private theme: Theme,
		private onStatus: (s: GameStatus) => void
	) {
		this.g = canvas.getContext('2d')!;
		this.resizeObserver = new ResizeObserver(() => this.resize());
		this.resizeObserver.observe(canvas);
		this.resize();
		this.raf = requestAnimationFrame(this.frame);
	}

	destroy(): void {
		this.stop();
		cancelAnimationFrame(this.raf);
		this.resizeObserver.disconnect();
	}

	setTheme(theme: Theme): void {
		this.theme = theme;
		this.resetWalker();
	}

	/** 1 = normal; más es acercar (menos tiempo y menos notas a la vista), menos es alejar. */
	setZoom(z: number): void {
		this.zoomTarget = z;
	}

	/** ¿La voz parece entrar desfasada respecto del ejercicio que terminó? */
	get looksDesynced(): boolean {
		return this.desynced;
	}

	setCollectible(skin: CollectibleSkin): void {
		this.collectible = skin;
	}

	setSequence(seq: Sequence, opts: GameOptions): void {
		this.stop();
		this.seq = seq;
		this.opts = opts;
		this.stars = buildStars(seq.notes);
		this.history = [];
		this.phase = 'idle';
		this.grounded = true;
		this.birdVy = 0;
		this.resetWalker();
		this.focusCamera(this.previewTime, true);
		this.emitStatus(true);
	}

	/** Instante del ejercicio que se ve antes de empezar: el comienzo de la cuenta previa. */
	private get previewTime(): number {
		return -0.2 - this.measureSec;
	}

	/** Duración de un pulso del metrónomo (negra en 4/4, corchea en 6/8), en segundos. */
	private get tickSec(): number {
		return (tickBeats(this.opts) * 60) / this.opts.bpm;
	}

	/** Duración de un compás en segundos (la cuenta previa dura uno). */
	private get measureSec(): number {
		return (measureBeats(this.opts) * 60) / this.opts.bpm;
	}

	start(source: PitchSource, latency: number): void {
		if (!this.seq.notes.length) return;
		this.stop();
		this.stars = buildStars(this.seq.notes);
		this.history = [];
		this.run = [];
		this.desynced = false;
		this.source = source;
		this.latency = latency;
		const ctx = getContext();
		// Escucha previa: suena una vez la primera repetición, sin la nota guía (esa queda para la
		// práctica); arranca directo en la primera nota a cantar.
		const first = this.seq.reps[0];
		const from = ctx.currentTime + 0.15;
		let listenSec = 0;
		const sung = this.seq.notes.filter((n) => n.rep === 0 && !n.isHint);
		const firstSung = sung.find((n) => !n.isRest);
		if (first && firstSung) {
			for (const n of sung) {
				if (n.isRest) continue;
				playNote(
					n.midi,
					from + n.start - firstSung.start,
					n.staccato ? n.duration * 0.5 : n.duration,
					0.7
				);
			}
			listenSec = first.end - firstSung.start + LISTEN_GAP_SEC;
		}
		this.listenEnd = from + listenSec;
		this.t0 = this.listenEnd + 0.05 + this.measureSec;
		this.nextNoteToSchedule = 0;
		this.nextBeatToSchedule = -this.opts.beatsPerMeasure;
		this.nextDrumStep = 0;
		this.phase = listenSec ? 'listen' : 'countin';
		this.grounded = this.phase === 'listen';
		this.emitStatus(true);
	}

	/** Congela el ejercicio donde está (se retoma con resume). */
	pause(): void {
		// Durante la escucha previa no hay nada que retomar: se vuelve al comienzo.
		if (this.phase === 'listen') {
			this.stop();
			this.emitStatus(true);
			return;
		}
		if (this.phase !== 'countin' && this.phase !== 'playing') return;
		this.pausedAt = getContext().currentTime - this.t0;
		this.phase = 'paused';
		stopAll();
		this.emitStatus(true, this.pausedAt - this.latency);
	}

	resume(): void {
		if (this.phase !== 'paused') return;
		const from = this.pausedAt - RESUME_PREROLL_SEC;
		this.t0 = getContext().currentTime - from;
		const notes = this.seq.notes;
		this.nextNoteToSchedule = notes.findIndex((n) => n.start >= from);
		if (this.nextNoteToSchedule < 0) this.nextNoteToSchedule = notes.length;
		this.nextBeatToSchedule = Math.ceil(from / this.tickSec);
		this.nextDrumStep = Math.max(0, Math.ceil(from / this.drumStepSec));
		const visible = from - this.latency;
		this.history = this.history.filter((h) => h.time <= visible);
		this.run = this.run.filter((h) => h.time <= visible);
		// Lo que se repite en el retroceso se vuelve a juzgar (si no, quedarían estrellas "recogidas"
		// en el futuro, con edad negativa).
		for (const s of this.stars) {
			if (s.time > visible - HIT_WINDOW_SEC) {
				s.state = 'idle';
				s.changedAt = 0;
			}
		}
		this.phase = from < 0 ? 'countin' : 'playing';
		this.emitStatus(true, visible);
	}

	stop(): void {
		if (
			this.phase === 'listen' ||
			this.phase === 'countin' ||
			this.phase === 'playing' ||
			this.phase === 'paused'
		)
			this.phase = 'idle';
		this.source = null;
		if (this.phase === 'idle') {
			this.grounded = true;
			this.resetWalker();
		}
		stopAll();
	}

	getStars(): Star[] {
		return this.stars;
	}

	// ---------- bucle ----------

	private frame = (ms: number): void => {
		this.raf = requestAnimationFrame(this.frame);
		const dt = Math.min(0.05, (ms - (this.lastFrame || ms)) / 1000);
		this.lastFrame = ms;
		this.animClock += dt * this.speed;
		this.zoomNow += (this.zoomTarget - this.zoomNow) * Math.min(1, dt * 10);
		const anim = this.animClock;

		let time = this.previewTime;
		if (this.phase === 'listen') {
			// Se ve la vista previa; la cuenta se programa con anticipación para que entre a tiempo.
			const ctx = getContext();
			this.scheduleAudio(ctx.currentTime - this.t0);
			if (ctx.currentTime >= this.listenEnd) {
				this.phase = 'countin';
				this.grounded = false;
				this.emitStatus(true);
			}
			this.sung = null;
			this.updateBird(dt);
		} else if (this.phase === 'countin' || this.phase === 'playing') {
			const songTime = getContext().currentTime - this.t0;
			this.scheduleAudio(songTime);
			time = songTime - this.latency;
			if (this.phase === 'countin' && songTime >= 0) this.phase = 'playing';
			this.updatePitch(time, dt);
			this.judgeStars(time);
			if (time > this.seq.duration + 0.6) this.finish();
		} else if (this.phase === 'paused') {
			time = this.pausedAt - this.latency;
			this.sung = null;
			this.updateBird(dt);
		} else if (this.phase === 'done') {
			time = this.seq.duration + 0.6;
			this.sung = null;
			this.updateBird(dt);
		} else {
			this.sung = null;
			this.updateBird(dt);
		}

		this.focusCamera(time, false, dt);
		this.draw(time, anim);
		this.emitStatus(false, time);
	};

	private scheduleAudio(songTime: number): void {
		const horizon = songTime + LOOKAHEAD_SEC;
		const notes = this.seq.notes;
		while (
			this.nextNoteToSchedule < notes.length &&
			notes[this.nextNoteToSchedule].start < horizon
		) {
			const n = notes[this.nextNoteToSchedule++];
			if (n.isRest || (!n.isHint && !this.opts.guide)) continue;
			playNote(
				n.midi,
				this.t0 + n.start,
				n.staccato ? n.duration * 0.5 : n.duration,
				n.isHint ? 0.9 : 0.6
			);
		}
		// Cuenta previa: siempre con clics.
		const pulse = this.tickSec;
		const per = this.opts.beatsPerMeasure;
		while (this.nextBeatToSchedule < 0 && this.nextBeatToSchedule * pulse < horizon) {
			const b = this.nextBeatToSchedule++;
			tick(this.t0 + b * pulse, ((b % per) + per) % per === 0);
		}
		// Batería: un paso del patrón cada `drumStepSec`; acentúa el primer paso de cada compás.
		const drums = this.opts.drums;
		if (!drums) return;
		const step = this.drumStepSec;
		const perMeasure = per * drums.stepsPerTick;
		while (this.nextDrumStep * step < horizon && this.nextDrumStep * step <= this.seq.duration) {
			const k = this.nextDrumStep++;
			for (const part of hitsAt(drums, k)) playDrum(part, this.t0 + k * step, k % perMeasure === 0);
		}
	}

	/** Duración de un paso del patrón de batería (el doble en medio tiempo), en segundos. */
	private get drumStepSec(): number {
		const steps = this.opts.drums?.stepsPerTick ?? 1;
		return (this.tickSec / steps) * (this.opts.drumsHalf ? 2 : 1);
	}

	private updatePitch(time: number, dt: number): void {
		this.now = time;
		const voice = this.source ? this.source(time) : null;
		// Mientras suena la nota guía el personaje la "canta" solo (ya no es la voz de la persona).
		const guide = this.noteAt(time);
		this.sung = guide?.isHint ? guide.midi : voice;
		this.history.push({ time, midi: this.sung });
		this.run.push({ time, midi: voice });
		while (this.history.length && this.history[0].time < time - 4) this.history.shift();
		this.updateBird(dt);
	}

	private updateBird(dt: number): void {
		this.stepBird(dt);
		// Con notas muy agudas o graves el personaje llega al borde de la pantalla y se queda ahí.
		const top = this.midiAt(this.birdSize * 0.5);
		const bottom =
			this.theme.movement === 'walk'
				? this.midiAt(this.groundTop - this.birdSize * 0.42)
				: this.midiAt(this.h - this.birdSize * 0.5);
		this.birdMidi = Math.max(bottom, Math.min(top, this.birdMidi));
	}

	private stepBird(dt: number): void {
		const prev = this.birdMidi;
		if (this.theme.movement === 'walk') {
			// En pausa queda congelada donde estaba.
			if (this.phase !== 'paused') this.updateWalker(dt);
		} else if (this.grounded) {
			// Antes de empezar el volador ya flota (sin objeto de partida) a la altura que marca el tema.
			this.birdMidi = this.midiAt(this.groundTop - this.birdSize * 0.42);
			this.birdVy = 0;
			return;
		} else if (this.sung !== null) {
			this.birdMidi += (this.sung - this.birdMidi) * Math.min(1, dt * 18);
		} else if (this.phase === 'countin') {
			// Despegue: sube hacia la primera nota mientras suena la cuenta.
			const first = this.seq.notes.find((n) => !n.isRest);
			if (first) this.birdMidi += (first.midi - this.birdMidi) * Math.min(1, dt * 2.5);
		} else {
			// Sin voz sigue volando en el lugar, sin salir de la vista.
			const floor = this.camCenter - this.camSpan / 2 + 1.5;
			const ceil = this.camCenter + this.camSpan / 2 - 1.5;
			const clamped = Math.max(floor, Math.min(ceil, this.birdMidi));
			this.birdMidi += (clamped - this.birdMidi) * Math.min(1, dt * 4);
		}
		const pxPerSemi = this.fieldH / this.camSpan;
		const vy = dt > 0 ? (-(this.birdMidi - prev) * pxPerSemi) / dt : 0;
		this.birdVy += (vy - this.birdVy) * Math.min(1, dt * 8);
	}

	private resetWalker(): void {
		this.jump = null;
		this.fallV = 0;
		this.silentFor = 0;
		this.airborne = false;
		this.sinceLanding = 1;
	}

	/**
	 * Caminante: sobre la nota que se canta afinado se para en su plataforma; al cambiar de altura
	 * salta en arco; desafinado sigue la voz en el aire, y en silencio cae al suelo con gravedad.
	 */
	private updateWalker(dt: number): void {
		const ground = this.midiAt(this.groundTop - this.birdSize * 0.42);
		this.sinceLanding += dt;
		const land = () => {
			if (this.airborne) this.sinceLanding = 0;
			this.airborne = false;
			this.fallV = 0;
		};

		if (this.grounded) {
			// Antes de empezar espera parada en el sendero.
			this.jump = null;
			this.birdMidi = ground;
			land();
			return;
		}
		if (this.sung === null && this.silentFor >= COYOTE_SEC) {
			// Sin voz: cae al sendero (o espera parada en él antes de empezar).
			this.jump = null;
			if (this.birdMidi <= ground + 0.05) {
				this.birdMidi = ground;
				land();
			} else {
				this.airborne = true;
				this.fallV += GRAVITY * dt;
				this.birdMidi = Math.max(ground, this.birdMidi - this.fallV * dt);
				if (this.birdMidi === ground) land();
			}
			if (this.sung === null) this.silentFor += dt;
			return;
		}
		if (this.sung === null) {
			// Silencio corto: se queda donde está, sin caer todavía.
			this.silentFor += dt;
			if (!this.jump) return;
		} else {
			this.silentFor = 0;
		}

		// Destino: la plataforma de la nota actual si se canta afinado; si no, la altura de la voz.
		let target = this.jump?.to ?? this.birdMidi;
		let onPlatform = false;
		if (this.sung !== null) {
			const n = this.noteAt(this.now);
			onPlatform = n !== null && Math.abs(this.sung - n.midi) <= this.opts.tolerance;
			target = Math.max(ground, onPlatform ? n!.midi : this.sung);
		}

		if (this.jump) {
			this.jump.to = target;
		} else if (Math.abs(target - this.birdMidi) >= JUMP_MIN) {
			const d = Math.abs(target - this.birdMidi);
			this.jump = {
				from: this.birdMidi,
				to: target,
				t: 0,
				dur: Math.min(0.42, 0.2 + d * 0.018) / this.speed,
				peak: 0.7 + d * 0.12
			};
		}
		if (this.jump) {
			const j = this.jump;
			j.t += dt;
			const p = Math.min(1, j.t / j.dur);
			this.birdMidi = j.from + (j.to - j.from) * p + j.peak * 4 * p * (1 - p);
			this.airborne = true;
			if (p >= 1) {
				this.jump = null;
				this.birdMidi = j.to;
				if (onPlatform || j.to <= ground + 0.05) land();
			}
			return;
		}
		// Ajustes chicos: sigue la voz; en el aire si no está sobre una plataforma ni el suelo.
		this.birdMidi += (target - this.birdMidi) * Math.min(1, dt * 18);
		if (onPlatform || this.birdMidi <= ground + 0.05) land();
		else this.airborne = true;
	}

	private judgeStars(time: number): void {
		for (const s of this.stars) {
			if (s.state !== 'idle') continue;
			if (s.time > time - HIT_WINDOW_SEC) break; // ordenadas por tiempo
			s.state = isHit(s, this.history, this.opts.tolerance) ? 'collected' : 'missed';
			s.changedAt = time;
		}
		// Recolección inmediata si ya se acertó dentro de la ventana (mejor respuesta visual).
		for (const s of this.stars) {
			if (s.time > time + HIT_WINDOW_SEC) break;
			if (s.state === 'idle' && isHit(s, this.history, this.opts.tolerance)) {
				s.state = 'collected';
				s.changedAt = time;
			}
		}
	}

	private finish(): void {
		this.phase = 'done';
		this.source = null;
		for (const s of this.stars) if (s.state === 'idle') s.state = 'missed';
		this.desynced = looksDesynced(
			bestShift(this.stars, this.run, this.opts.tolerance),
			this.stars.length
		);
		this.emitStatus(true);
	}

	// ---------- cámara y coordenadas ----------

	private focusCamera(time: number, snap: boolean, dt = 0): void {
		// Antes de la primera nota (vista previa, cuenta) se encuadran las notas que vienen.
		const first = this.seq.notes.find((n) => !n.isRest);
		if (first && time < first.start) time = first.start;
		let lo = Infinity;
		let hi = -Infinity;
		for (const n of this.seq.notes) {
			if (n.start + n.duration < time - 0.3) continue;
			if (n.start > time + 3 / (this.speed * this.zoomNow)) break;
			if (n.isRest) continue;
			lo = Math.min(lo, n.midi);
			hi = Math.max(hi, n.midi);
		}
		if (lo === Infinity) return;
		const center = (lo + hi) / 2;
		// El zoom achica o agranda el rango de notas a la vista, sin dejar notas fuera de pantalla.
		const span = Math.max(hi - lo + 3, Math.max(13, hi - lo + 7) / this.zoomNow);
		const k = snap ? 1 : Math.min(1, dt * 2.5);
		this.camCenter += (center - this.camCenter) * k;
		this.camSpan += (span - this.camSpan) * k;
	}

	/**
	 * Alto (px) de la zona donde van las notas. El volador usa todo el canvas; el caminante, lo que
	 * queda sobre el suelo, para que la plataforma más grave no quede debajo del sendero.
	 */
	private get fieldH(): number {
		if (this.theme.movement !== 'walk') return this.h;
		return Math.max(this.h * 0.4, this.groundTop - this.birdSize * 0.42 - 14);
	}

	private midiAt(y: number): number {
		return this.camCenter + (this.fieldH / 2 - y) / (this.fieldH / this.camSpan);
	}

	/** Altura donde se para el personaje antes de empezar (la define el tema: copa del árbol, suelo…). */
	private get groundTop(): number {
		return this.theme.startSurface(this.h);
	}

	private get birdSize(): number {
		return Math.max(56, Math.min(110, this.h * 0.16));
	}

	private y(midi: number): number {
		return this.fieldH / 2 - (midi - this.camCenter) * (this.fieldH / this.camSpan);
	}

	/** Velocidad relativa al tempo de referencia (la usan el avance y las animaciones). */
	private get speed(): number {
		return Math.max(0.5, this.opts.bpm / REF_BPM);
	}

	/**
	 * Píxeles por segundo. Crece con el tempo: cada tiempo ocupa siempre el mismo ancho (las perchas
	 * no se achican) y lo que cambia es qué tan rápido pasan.
	 */
	private get pps(): number {
		return Math.max(120, this.w / 6.5) * this.speed * this.zoomNow;
	}

	private get birdX(): number {
		return this.w * 0.26;
	}

	private x(time: number, now: number): number {
		return this.birdX + (time - now) * this.pps;
	}

	// ---------- dibujo ----------

	private resize(): void {
		const rect = this.canvas.getBoundingClientRect();
		this.dpr = Math.min(2, window.devicePixelRatio || 1);
		this.w = rect.width;
		this.h = rect.height;
		this.canvas.width = Math.round(rect.width * this.dpr);
		this.canvas.height = Math.round(rect.height * this.dpr);
	}

	private draw(time: number, anim: number): void {
		const { g, w, h } = this;
		if (!w || !h) return;
		g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
		const progress = this.seq.duration ? Math.max(0, Math.min(1, time / this.seq.duration)) : 0;
		const scroll = Math.max(0, time - this.previewTime) * this.pps;
		this.theme.drawBackground(g, w, h, scroll, progress);
		// Punto de partida (árbol): queda donde esperaba el personaje y se aleja al despegar.
		this.theme.drawStart(g, this.x(this.previewTime, time), w, h);
		this.drawPerches(time);
		if (this.theme.movement === 'fly') this.drawTrail(time);
		this.drawStars(time, anim);

		const current = this.noteAt(time);
		const onTarget =
			this.sung !== null &&
			current !== null &&
			!current.isHint &&
			Math.abs(this.sung - current.midi) <= this.opts.tolerance;
		this.theme.drawCharacter(g, this.birdX, this.y(this.birdMidi), this.birdSize, anim, {
			flying: this.theme.movement === 'fly' || !this.grounded,
			facingFront: this.phase === 'listen',
			moving: this.phase === 'countin' || this.phase === 'playing',
			airborne: this.airborne,
			sinceLanding: this.sinceLanding,
			singing: this.sung !== null,
			onTarget,
			vy: this.birdVy
		});
	}

	private drawPerches(time: number): void {
		for (const n of this.seq.notes) {
			if (n.isRest) continue;
			const x0 = this.x(n.start, time);
			const x1 = this.x(n.start + n.duration, time);
			if (x1 < -20) continue;
			if (x0 > this.w + 20) break;
			const gap = Math.min(6, (x1 - x0) * 0.1);
			const y = this.y(n.midi);
			this.theme.drawPerch(this.g, x0 + gap, y, Math.max(4, x1 - x0 - gap * 2), {
				footY: y + this.birdSize * 0.42,
				hint: n.isHint,
				past: n.start + n.duration < time,
				label: n.syllable ? `${midiToNote(n.midi)} · ${n.syllable}` : midiToNote(n.midi)
			});
		}
	}

	/**
	 * Estela de viento detrás del personaje: tres cintas que siguen el tono cantado, se abren con
	 * la distancia y se afinan hacia la cola. Cada cinta es un solo polígono con degradé (sin
	 * filtros ni sombras difuminadas, que son caros por cuadro).
	 */
	private drawTrail(time: number): void {
		const { g } = this;
		// La longitud en pantalla se mantiene: a más tempo, menos segundos de estela.
		const trailSec = TRAIL_SEC / (this.speed * this.zoomNow);
		const points: { x: number; y: number; age: number }[] = [];
		for (let i = this.history.length - 1; i >= 0; i--) {
			const s = this.history[i];
			const age = time - s.time;
			if (age > trailSec) break;
			if (s.midi === null) {
				if (points.length) break; // la estela se corta en el silencio
				continue;
			}
			// Igual que el personaje, la estela no sale de la pantalla.
			const y = Math.max(
				this.birdSize * 0.5,
				Math.min(this.h - this.birdSize * 0.5, this.y(s.midi))
			);
			points.push({ x: this.x(s.time, time) - 22, y, age });
		}
		if (points.length < 2) return;

		const ribbon = (offset: number, width: number, length: number, color: string, dy = 0) => {
			const pts = points.filter((p) => p.age < length);
			if (pts.length < 2) return;
			const top: [number, number][] = [];
			const bottom: [number, number][] = [];
			for (const p of pts) {
				const t = p.age / length;
				// Las cintas se separan con la distancia y ondulan apenas, como ráfagas.
				const y =
					p.y + dy + offset * (6 + p.age * 26) + Math.sin(p.age * 8 + offset * 2) * p.age * 5;
				const half = (width / 2) * Math.pow(1 - t, 0.8);
				top.push([p.x, y - half]);
				bottom.push([p.x, y + half]);
			}
			const head = pts[0].x;
			const tail = pts[pts.length - 1].x;
			const grad = g.createLinearGradient(head, 0, Math.min(tail, head - 1), 0);
			grad.addColorStop(0, color);
			grad.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
			g.fillStyle = grad;
			g.beginPath();
			g.moveTo(top[0][0], top[0][1]);
			for (const [x, y] of top) g.lineTo(x, y);
			for (let i = bottom.length - 1; i >= 0; i--) g.lineTo(bottom[i][0], bottom[i][1]);
			g.closePath();
			g.fill();
		};
		// Primero una copia azulada corrida 2 px (se lee sobre las nubes blancas), después el blanco.
		for (const [color, dy] of [
			['rgba(50,100,180,0.12)', 1.5],
			['rgba(255,255,255,0.28)', 0]
		] as const) {
			ribbon(-1, 4, trailSec * 0.75, color, dy);
			ribbon(1, 4, trailSec * 0.75, color, dy);
			ribbon(0, 6.5, trailSec, color, dy);
		}
	}

	private drawStars(time: number, anim: number): void {
		const size = Math.max(9, Math.min(15, (this.fieldH / this.camSpan) * 0.45));
		for (const s of this.stars) {
			const x = this.x(s.time, time);
			if (x < -40) continue;
			if (x > this.w + 40) break;
			let y = this.y(s.midi);
			let sx = x;
			if (s.state === 'collected') {
				sx = this.birdX + (s.time - s.changedAt) * this.pps; // sigue al pájaro mientras desaparece
				y = this.y(s.midi);
			}
			const age = s.state === 'idle' ? 0 : Math.max(0, time - s.changedAt);
			if (s.state === 'collected' && age > 0.6) continue;
			this.collectible.draw(this.g, sx, y, size, s.state, age, anim, s.noteId);
		}
	}

	private noteAt(time: number): TimedNote | null {
		for (const n of this.seq.notes) {
			if (n.start > time) break;
			if (!n.isRest && time < n.start + n.duration) return n;
		}
		return null;
	}

	// ---------- estado hacia la UI ----------

	private emitStatus(force: boolean, time = this.previewTime): void {
		let collected = 0;
		let missed = 0;
		for (const s of this.stars) {
			if (s.state === 'collected') collected++;
			else if (s.state === 'missed') missed++;
		}
		const countIn =
			this.phase === 'countin'
				? Math.max(1, Math.ceil(-(time + this.latency) / this.tickSec))
				: null;
		let rep = 0;
		for (let i = 0; i < this.seq.reps.length; i++) if (this.seq.reps[i].start <= time) rep = i;
		const sungMidi = this.sung === null ? null : Math.round(this.sung);
		const key = `${this.phase}|${collected}|${missed}|${rep}|${countIn}|${sungMidi}|${Math.round(time * 4)}`;
		if (!force && key === this.lastStatusKey) return;
		this.lastStatusKey = key;
		this.onStatus({
			phase: this.phase,
			collected,
			missed,
			total: this.stars.length,
			rep,
			reps: this.seq.reps.length,
			root: this.seq.reps[rep]?.root ?? '',
			progress: this.seq.duration ? Math.max(0, Math.min(1, time / this.seq.duration)) : 0,
			countIn,
			sungMidi
		});
	}
}

/** Fuente de tono simulada: canta la nota correcta con un leve vibrato (modo demo, sin micrófono). */
export function autopilot(seq: Sequence): PitchSource {
	return (time) => {
		for (const n of seq.notes) {
			if (n.start > time) break;
			if (n.isRest || n.isHint || time >= n.start + n.duration - 0.03) continue;
			if (time < n.start + 0.04) return null;
			return n.midi + 0.15 * Math.sin(time * 2 * Math.PI * 5.5);
		}
		return null;
	};
}
