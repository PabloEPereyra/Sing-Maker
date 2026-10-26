// Motor del juego: tiempo, cámara, física del personaje, puntuación y dibujo vía Theme.
// El tiempo maestro es el reloj del AudioContext, así el piano y lo que se ve no se desfasan.
import { getContext, playNote, stopAll, tick } from '$lib/audio/engine';
import type { Sequence, TimedNote } from '$lib/music/generate';
import { midiToNote } from '$lib/music/notes';
import { COLLECTIBLES, type CollectibleSkin } from './collectibles';
import { buildStars, HIT_WINDOW_SEC, isHit, type PitchSample, type Star } from './scoring';
import type { Theme } from './theme';

export type Phase = 'idle' | 'countin' | 'playing' | 'paused' | 'done';

/** Al reanudar se retrocede este tiempo para retomar con contexto. */
const RESUME_PREROLL_SEC = 1;

export interface GameOptions {
	bpm: number;
	beatsPerMeasure: number;
	/** El piano toca las notas a cantar (las guías suenan siempre). */
	guide: boolean;
	metronome: boolean;
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

/** Duración (s) de la estela de viento detrás del personaje. */
const TRAIL_SEC = 1.6;
const LOOKAHEAD_SEC = 0.35;

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
		guide: true,
		metronome: false,
		tolerance: 0.6
	};
	private stars: Star[] = [];
	private history: PitchSample[] = [];
	private phase: Phase = 'idle';
	private t0 = 0; // tiempo del AudioContext en que empieza el ejercicio
	private latency = 0;
	private source: PitchSource | null = null;
	private nextNoteToSchedule = 0;
	private nextBeatToSchedule = 0;
	private pausedAt = 0;

	private birdMidi = 60;
	private birdVy = 0;
	/** Antes de pulsar play el personaje espera en el suelo; despega al empezar. */
	private grounded = true;
	private sung: number | null = null;
	private camCenter = 60;
	private camSpan = 14;
	private lastStatusKey = '';
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
		this.focusCamera(this.previewTime, true);
		this.emitStatus(true);
	}

	/** Instante del ejercicio que se ve antes de empezar: el comienzo de la cuenta previa. */
	private get previewTime(): number {
		return -0.2 - (this.opts.beatsPerMeasure * 60) / this.opts.bpm;
	}

	start(source: PitchSource, latency: number): void {
		if (!this.seq.notes.length) return;
		this.stop();
		this.stars = buildStars(this.seq.notes);
		this.history = [];
		this.source = source;
		this.latency = latency;
		const ctx = getContext();
		const beat = 60 / this.opts.bpm;
		this.t0 = ctx.currentTime + 0.2 + this.opts.beatsPerMeasure * beat;
		this.nextNoteToSchedule = 0;
		this.nextBeatToSchedule = -this.opts.beatsPerMeasure;
		this.phase = 'countin';
		this.grounded = false;
		this.emitStatus(true);
	}

	/** Congela el ejercicio donde está (se retoma con resume). */
	pause(): void {
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
		this.nextBeatToSchedule = Math.ceil(from / (60 / this.opts.bpm));
		const visible = from - this.latency;
		this.history = this.history.filter((h) => h.time <= visible);
		this.phase = from < 0 ? 'countin' : 'playing';
		this.emitStatus(true, visible);
	}

	stop(): void {
		if (this.phase === 'countin' || this.phase === 'playing' || this.phase === 'paused')
			this.phase = 'idle';
		this.source = null;
		if (this.phase === 'idle') this.grounded = true;
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
		const anim = ms / 1000;

		let time = this.previewTime;
		if (this.phase === 'countin' || this.phase === 'playing') {
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
		const beat = 60 / this.opts.bpm;
		while (this.nextBeatToSchedule * beat < horizon) {
			const b = this.nextBeatToSchedule++;
			const inCountIn = b < 0;
			if (inCountIn || (this.opts.metronome && b * beat <= this.seq.duration)) {
				const accent =
					((b % this.opts.beatsPerMeasure) + this.opts.beatsPerMeasure) %
						this.opts.beatsPerMeasure ===
					0;
				tick(this.t0 + b * beat, accent);
			}
		}
	}

	private updatePitch(time: number, dt: number): void {
		this.sung = this.source ? this.source(time) : null;
		this.history.push({ time, midi: this.sung });
		while (this.history.length && this.history[0].time < time - 4) this.history.shift();
		this.updateBird(dt);
	}

	private updateBird(dt: number): void {
		const prev = this.birdMidi;
		if (this.grounded) {
			// Parado sobre el suelo.
			this.birdMidi = this.midiAt(this.groundTop - this.birdSize * 0.42);
			this.birdVy = 0;
			return;
		}
		if (this.sung !== null) {
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
		const pxPerSemi = this.h / this.camSpan;
		const vy = dt > 0 ? (-(this.birdMidi - prev) * pxPerSemi) / dt : 0;
		this.birdVy += (vy - this.birdVy) * Math.min(1, dt * 8);
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
			if (n.start > time + 3) break;
			if (n.isRest) continue;
			lo = Math.min(lo, n.midi);
			hi = Math.max(hi, n.midi);
		}
		if (lo === Infinity) return;
		const center = (lo + hi) / 2;
		const span = Math.max(13, hi - lo + 7);
		const k = snap ? 1 : Math.min(1, dt * 2.5);
		this.camCenter += (center - this.camCenter) * k;
		this.camSpan += (span - this.camSpan) * k;
	}

	private midiAt(y: number): number {
		return this.camCenter + (this.h / 2 - y) / (this.h / this.camSpan);
	}

	/** Altura donde se para el personaje antes de empezar (la define el tema: copa del árbol, suelo…). */
	private get groundTop(): number {
		return this.theme.startSurface(this.h);
	}

	private get birdSize(): number {
		return Math.max(56, Math.min(110, this.h * 0.16));
	}

	private y(midi: number): number {
		return this.h / 2 - (midi - this.camCenter) * (this.h / this.camSpan);
	}

	private get pps(): number {
		return Math.max(120, this.w / 6.5);
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
		this.drawTrail(time);
		this.drawStars(time, anim);

		const current = this.noteAt(time);
		const onTarget =
			this.sung !== null &&
			current !== null &&
			!current.isHint &&
			Math.abs(this.sung - current.midi) <= this.opts.tolerance;
		this.theme.drawCharacter(g, this.birdX, this.y(this.birdMidi), this.birdSize, anim, {
			flying: !this.grounded,
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
			this.theme.drawPerch(this.g, x0 + gap, this.y(n.midi), Math.max(4, x1 - x0 - gap * 2), {
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
		const points: { x: number; y: number; age: number }[] = [];
		for (let i = this.history.length - 1; i >= 0; i--) {
			const s = this.history[i];
			const age = time - s.time;
			if (age > TRAIL_SEC) break;
			if (s.midi === null) {
				if (points.length) break; // la estela se corta en el silencio
				continue;
			}
			points.push({ x: this.x(s.time, time) - 22, y: this.y(s.midi), age });
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
			ribbon(-1, 4, TRAIL_SEC * 0.75, color, dy);
			ribbon(1, 4, TRAIL_SEC * 0.75, color, dy);
			ribbon(0, 6.5, TRAIL_SEC, color, dy);
		}
	}

	private drawStars(time: number, anim: number): void {
		const size = Math.max(9, Math.min(15, (this.h / this.camSpan) * 0.45));
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
			const age = s.state === 'idle' ? 0 : time - s.changedAt;
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
		const beat = 60 / this.opts.bpm;
		const countIn =
			this.phase === 'countin' ? Math.max(1, Math.ceil(-(time + this.latency) / beat)) : null;
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
