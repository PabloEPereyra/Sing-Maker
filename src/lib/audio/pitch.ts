// Detección de tono desde el micrófono, con la cadena de filtros de Voicexplorer
// (vocal-scales y karaoke-star):
//   1. Micrófono sin procesado del navegador (echo/noise/AGC deforman YIN), pasa-altos 80 Hz.
//   2. YIN con claridad y corrección de octava en graves (voicexplorer/src/lib/tools/vibrato/analysis.ts).
//   3. Tracker: descarta lecturas de baja claridad, sostiene la última nota en cortes breves
//      y suaviza (voicexplorer/src/lib/tools/tuning/analysis.ts, TuningTracker).
//   4. Mediana de 3 + histéresis de octava y de saltos grandes (voicexplorer/src/lib/tools/karaoke/audio.ts).
// Nuevo aquí: calibración del ruido ambiente para fijar la puerta de volumen.

const FFT_SIZE = 4096;
const MIN_FREQ = 65; // ~C2
const MAX_FREQ = 1000; // ~B5
const YIN_THRESHOLD = 0.15;
const MIN_CLARITY = 0.25;
const SMOOTHING = 0.5;
const DROPOUT_HOLD_MS = 250;
const DEFAULT_GATE_RMS = 0.006;

export interface PitchResult {
	frequency: number;
	clarity: number;
}

export interface PitchReading {
	/** MIDI fraccionario estabilizado, o null si no hay voz. */
	midi: number | null;
	rms: number;
	clarity: number;
}

export class PitchDetector {
	private stream: MediaStream | null = null;
	private source: MediaStreamAudioSourceNode | null = null;
	private analyser: AnalyserNode | null = null;
	private buffer = new Float32Array(FFT_SIZE);
	private gateRms = DEFAULT_GATE_RMS;
	private stabilizer = new PitchStabilizer();

	constructor(private ctx: AudioContext) {}

	get active(): boolean {
		return this.analyser !== null;
	}

	/** Puerta de volumen calibrada (RMS). */
	get gate(): number {
		return this.gateRms;
	}

	/** Latencia estimada: media ventana + suavizado/mediana (~2 cuadros) + dispositivo. */
	get latency(): number {
		const windowSec = FFT_SIZE / this.ctx.sampleRate / 2;
		return windowSec / 2 + 2 / 60 + (this.ctx.baseLatency || 0.01);
	}

	async start(): Promise<void> {
		this.stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				channelCount: 1,
				echoCancellation: false,
				noiseSuppression: false,
				autoGainControl: false
			}
		});
		this.source = this.ctx.createMediaStreamSource(this.stream);
		const highPass = this.ctx.createBiquadFilter();
		highPass.type = 'highpass';
		highPass.frequency.value = 80;
		this.analyser = this.ctx.createAnalyser();
		this.analyser.fftSize = FFT_SIZE;
		this.analyser.smoothingTimeConstant = 0.08;
		this.source.connect(highPass);
		highPass.connect(this.analyser);
		this.stabilizer.reset();
	}

	stop(): void {
		this.stream?.getTracks().forEach((t) => t.stop());
		this.source?.disconnect();
		this.stream = null;
		this.source = null;
		this.analyser = null;
		this.stabilizer.reset();
	}

	/**
	 * Mide el ruido ambiente durante `ms` (en silencio) y fija la puerta de volumen
	 * un poco por encima. Devuelve la puerta elegida.
	 */
	async calibrate(ms = 700): Promise<number> {
		if (!this.analyser) return this.gateRms;
		const levels: number[] = [];
		const until = performance.now() + ms;
		while (performance.now() < until) {
			this.analyser.getFloatTimeDomainData(this.buffer);
			levels.push(rmsOf(this.buffer));
			await new Promise((r) => setTimeout(r, 30));
		}
		levels.sort((a, b) => a - b);
		const noise = levels[Math.floor(levels.length * 0.9)] ?? 0;
		this.gateRms = Math.min(0.05, Math.max(0.004, noise * 2.5));
		return this.gateRms;
	}

	read(now = performance.now()): PitchReading {
		if (!this.analyser) return { midi: null, rms: 0, clarity: 0 };
		this.analyser.getFloatTimeDomainData(this.buffer);
		const rms = rmsOf(this.buffer);
		const result =
			rms >= this.gateRms ? yin(this.buffer, this.ctx.sampleRate, MIN_FREQ, MAX_FREQ) : null;
		const midi = this.stabilizer.update(now, result, rms >= this.gateRms * 0.6);
		return { midi, rms, clarity: result?.clarity ?? 0 };
	}
}

/**
 * Convierte lecturas crudas de YIN en una curva estable. Separado del micrófono para poder
 * probarlo con secuencias sintéticas.
 */
export class PitchStabilizer {
	// tracker
	private smoothed: number | null = null;
	private lastValidAt = 0;
	// mediana + histéresis
	private window: number[] = [];
	private lastStable: number | null = null;
	private suspect: number | null = null;
	private suspectCount = 0;

	reset(): void {
		this.smoothed = null;
		this.lastValidAt = 0;
		this.window = [];
		this.lastStable = null;
		this.suspect = null;
		this.suspectCount = 0;
	}

	/** `voiced` = hay señal suficiente para sostener la última nota en un corte breve. */
	update(now: number, result: PitchResult | null, voiced: boolean): number | null {
		const tracked = this.track(now, result, voiced);
		if (tracked === null) {
			// Silencio: se vacía la mediana pero se recuerda la última nota como referencia de octava.
			this.window = [];
			this.suspect = null;
			this.suspectCount = 0;
			return null;
		}
		this.window.push(tracked);
		if (this.window.length > 3) this.window.shift();
		const median = [...this.window].sort((a, b) => a - b)[Math.floor(this.window.length / 2)];
		const clarity = result?.clarity ?? 0;

		if (this.lastStable === null) return this.accept(median);
		const dist = Math.abs(median - this.lastStable);
		if (dist >= 10 && dist <= 14) {
			// Posible error de octava: se acepta solo si se sostiene 2 cuadros.
			return this.confirm(median, 2);
		}
		if (dist >= 6) {
			// Salto grande que no es octava: alta claridad o 2 cuadros sostenidos.
			return clarity > 0.82 ? this.accept(median) : this.confirm(median, 2);
		}
		return this.accept(median);
	}

	private track(now: number, result: PitchResult | null, voiced: boolean): number | null {
		if (!result || result.clarity < MIN_CLARITY || !Number.isFinite(result.frequency)) {
			if (this.smoothed !== null && voiced && now - this.lastValidAt <= DROPOUT_HOLD_MS) {
				return this.smoothed;
			}
			this.smoothed = null;
			return null;
		}
		const midi = 69 + 12 * Math.log2(result.frequency / 440);
		// Al cambiar de nota con un salto grande no se arrastra el suavizado (evita glissandos falsos).
		this.smoothed =
			this.smoothed === null || Math.abs(midi - this.smoothed) > 1.5
				? midi
				: this.smoothed + (midi - this.smoothed) * SMOOTHING;
		this.lastValidAt = now;
		return this.smoothed;
	}

	private accept(midi: number): number {
		this.suspect = null;
		this.suspectCount = 0;
		this.lastStable = midi;
		return midi;
	}

	private confirm(midi: number, frames: number): number {
		if (this.suspect !== null && Math.abs(this.suspect - midi) < 1) this.suspectCount++;
		else {
			this.suspect = midi;
			this.suspectCount = 1;
		}
		if (this.suspectCount >= frames) return this.accept(midi);
		return this.lastStable!;
	}
}

export function rmsOf(buffer: Float32Array): number {
	let sum = 0;
	for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
	return Math.sqrt(sum / Math.max(1, buffer.length));
}

/**
 * YIN con medida de claridad y corrección de octava para graves.
 * Portado de voicexplorer/src/lib/tools/vibrato/analysis.ts (PitchDetector.detect).
 */
export function yin(
	buffer: Float32Array,
	sampleRate: number,
	minFreq = MIN_FREQ,
	maxFreq = MAX_FREQ,
	threshold = YIN_THRESHOLD,
	step = 2
): PitchResult | null {
	const yinLength = Math.floor(buffer.length / 2);
	const yinBuffer = new Float32Array(yinLength);
	const minTau = Math.max(2, Math.floor(sampleRate / maxFreq));
	const maxTau = Math.min(yinLength - 1, Math.floor(sampleRate / minFreq));
	if (minTau >= maxTau) return null;

	yinBuffer[0] = 1;
	let runningSum = 0;
	for (let tau = 1; tau <= maxTau; tau++) {
		let delta = 0;
		for (let i = 0; i < yinLength; i += step) {
			const d = buffer[i] - buffer[i + tau];
			delta += d * d;
		}
		runningSum += delta;
		yinBuffer[tau] = (delta * tau) / (runningSum || 1);
	}

	let tauEstimate = -1;
	for (let tau = minTau; tau <= maxTau; tau++) {
		if (yinBuffer[tau] >= threshold) continue;
		while (tau + 1 <= maxTau && yinBuffer[tau + 1] < yinBuffer[tau]) tau++;
		tauEstimate = tau;
		break;
	}
	if (tauEstimate === -1) {
		let best = Infinity;
		for (let tau = minTau; tau <= maxTau; tau++) {
			if (yinBuffer[tau] < best) {
				best = yinBuffer[tau];
				tauEstimate = tau;
			}
		}
		if (best > 0.25) return null;
	}

	let finalTau = parabolic(yinBuffer, tauEstimate);
	// Si se detectó el 2.º armónico de una voz grave, preferir el subarmónico plausible.
	if (finalTau > minTau * 2) {
		const halfIndex = Math.round(finalTau / 2);
		if (halfIndex >= minTau && halfIndex <= maxTau) {
			const halfValue = yinBuffer[halfIndex];
			const currentValue = yinBuffer[tauEstimate];
			if (halfValue < threshold * 1.8 && halfValue < currentValue * 1.6) {
				const refined = parabolic(yinBuffer, halfIndex);
				const halfFreq = sampleRate / refined;
				if (halfFreq >= minFreq && halfFreq <= maxFreq) finalTau = refined;
			}
		}
	}
	const frequency = sampleRate / finalTau;
	if (frequency < minFreq || frequency > maxFreq) return null;
	return { frequency, clarity: Math.max(0, Math.min(1, 1 - yinBuffer[tauEstimate])) };
}

function parabolic(buffer: Float32Array, i: number): number {
	if (i <= 0 || i + 1 >= buffer.length) return i;
	const prev = buffer[i - 1];
	const cur = buffer[i];
	const next = buffer[i + 1];
	const den = 2 * (2 * cur - next - prev);
	return den === 0 ? i : i + (next - prev) / den;
}
