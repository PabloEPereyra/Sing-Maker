// SOLO DESARROLLO: renderiza la demostración a un video sin reproducirla.
// Un segundo `Game` (sobre un canvas fuera de pantalla, con reloj virtual) avanza a cuadros fijos más
// rápido que el tiempo real; el audio se renderiza aparte con un OfflineAudioContext y ambos se
// codifican con WebCodecs y se empaquetan en un .webm. Solo se importa detrás de `import.meta.env.DEV`.

import { ArrayBufferTarget, Muxer } from 'webm-muxer';
import { AudioRecorder, loadDrums, loadPiano } from '$lib/audio/engine';
import { skinFor } from '$lib/game/collectibles';
import { autopilot, Game, type GameOptions } from '$lib/game/game';
import type { Theme } from '$lib/game/theme';
import type { Sequence } from '$lib/music/generate';
import { noteLabel, settings } from '$lib/settings.svelte';

const FPS = 60;
/** Escenario lógico de 1280×720 a escala 1,5 = 1920×1080 en el video. */
const STAGE_W = 1280;
const STAGE_H = 720;
const STAGE_DPR = 1.5;
const VIDEO_BPS = 12_000_000;
const AUDIO_RATE = 48000;
const AUDIO_BPS = 192_000;
/** Cola al final, para que no se corte el último sonido. */
const TAIL_SEC = 1.5;
/** Tope de seguridad (un ejercicio no debería pasar de 15 minutos). */
const MAX_SEC = 15 * 60;

export interface RenderArgs {
	theme: Theme;
	sequence: Sequence;
	options: GameOptions;
	title: string;
	/** 0–1 */
	onProgress: (p: number) => void;
	/** Para cancelar el render a mitad de camino. */
	signal?: AbortSignal;
}

/**
 * Cede el hilo sin usar temporizadores: en una pestaña en segundo plano `setTimeout` se frena a una
 * vez por segundo (o por minuto), y con eso el render se arrastraba; un mensaje de canal no se frena.
 */
function yieldNow(): Promise<void> {
	return new Promise((resolve) => {
		const ch = new MessageChannel();
		ch.port1.onmessage = () => {
			ch.port1.close();
			resolve();
		};
		ch.port2.postMessage(0);
	});
}

/** Espera a que la cola del codificador baje de `max` (se despierta con su evento `dequeue`). */
function drain(enc: VideoEncoder | AudioEncoder, max: number): Promise<void> {
	return new Promise((resolve) => {
		if (enc.encodeQueueSize <= max) return resolve();
		const check = () => {
			if (enc.encodeQueueSize > max) return;
			enc.removeEventListener('dequeue', check);
			resolve();
		};
		enc.addEventListener('dequeue', check);
	});
}

export async function renderDemoVideo(a: RenderArgs): Promise<void> {
	if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined')
		throw new Error('Este navegador no tiene WebCodecs (usá Chrome o Edge).');

	// Muestras y recursos: sin esto el audio caería al sintetizador y faltarían imágenes.
	await Promise.all([loadPiano(), a.options.drums ? loadDrums() : null, a.theme.load()]);
	const skin = skinFor(settings.collectible);
	await skin.load();
	// Mismo tipo de letra que el anuncio de la nota guía de la página (el canvas necesita que esté cargado).
	const family =
		getComputedStyle(document.documentElement)
			.getPropertyValue('--font-display')
			.split(',')[0]
			.trim() || 'sans-serif';
	await document.fonts.load(`128px ${family}`);

	const width = Math.round(STAGE_W * STAGE_DPR);
	const height = Math.round(STAGE_H * STAGE_DPR);
	const canvas = document.createElement('canvas');
	const recorder = new AudioRecorder();
	let progress = 0;
	const game = new Game(canvas, a.theme, (s) => (progress = s.phase === 'done' ? 1 : s.progress), {
		recorder,
		width: STAGE_W,
		height: STAGE_H,
		dpr: STAGE_DPR,
		guide: { label: noteLabel, font: `${family}, sans-serif` }
	});
	let venc: VideoEncoder | undefined;
	let aenc: AudioEncoder | undefined;
	try {
		game.setCollectible(skin);
		game.setZoom(settings.zoom, true);
		game.setSequence(a.sequence, { ...a.options });
		game.start(autopilot(a.sequence), 0);

		// ---- video ----
		let failure: unknown = null;
		const vcodec = (
			await VideoEncoder.isConfigSupported({
				codec: 'vp09.00.41.08',
				width,
				height
			})
		).supported
			? { id: 'vp09.00.41.08', mkv: 'V_VP9' as const }
			: { id: 'vp8', mkv: 'V_VP8' as const };
		const muxer = new Muxer({
			target: new ArrayBufferTarget(),
			video: { codec: vcodec.mkv, width, height, frameRate: FPS },
			audio: { codec: 'A_OPUS', numberOfChannels: 2, sampleRate: AUDIO_RATE },
			firstTimestampBehavior: 'strict'
		});
		venc = new VideoEncoder({
			output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
			error: (e) => (failure = e)
		});
		venc.configure({
			codec: vcodec.id,
			width,
			height,
			bitrate: VIDEO_BPS,
			framerate: FPS
		});

		const frameUs = 1e6 / FPS;
		let frames = 0;
		let tail = 0;
		// Dónde se va el tiempo (ms): simular y dibujar, crear el cuadro, codificar, esperar al codificador.
		const spent = { sim: 0, frame: 0, encode: 0, wait: 0 };
		const t00 = performance.now();
		for (;;) {
			// El cuadro 0 es el instante 0 (dt = 0): así imagen y audio parten juntos.
			let t = performance.now();
			game.stepOffline(frames === 0 ? 0 : 1 / FPS);
			spent.sim += performance.now() - t;
			t = performance.now();
			const frame = new VideoFrame(canvas, {
				timestamp: Math.round(frames * frameUs),
				duration: Math.round(frameUs)
			});
			spent.frame += performance.now() - t;
			t = performance.now();
			venc.encode(frame, { keyFrame: frames % (FPS * 2) === 0 });
			frame.close();
			spent.encode += performance.now() - t;
			frames++;
			if (game.currentPhase === 'done' && ++tail >= TAIL_SEC * FPS) break;
			if (frames / FPS > MAX_SEC) throw new Error('El ejercicio no termina (más de 15 minutos).');
			if (failure) throw failure;
			a.signal?.throwIfAborted();
			t = performance.now();
			await drain(venc, 30);
			spent.wait += performance.now() - t;
			if (frames % 300 === 0) {
				const el = performance.now() - t00;
				console.info(
					`[video] ${frames} cuadros, ${((frames / el) * 1000).toFixed(1)} cuadros/s`,
					Object.fromEntries(Object.entries(spent).map(([k, v]) => [k, Math.round(v)]))
				);
			}
			if (frames % 15 === 0) {
				a.onProgress(progress * 0.9);
				await yieldNow();
			}
		}
		await venc.flush();
		if (failure) throw failure;

		// ---- audio ----
		a.signal?.throwIfAborted();
		a.onProgress(0.92);
		const seconds = frames / FPS;
		const pcm = await recorder.render(seconds, AUDIO_RATE);
		aenc = new AudioEncoder({
			output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
			error: (e) => (failure = e)
		});
		aenc.configure({
			codec: 'opus',
			numberOfChannels: 2,
			sampleRate: AUDIO_RATE,
			bitrate: AUDIO_BPS
		});
		const left = pcm.getChannelData(0);
		const right = pcm.getChannelData(1);
		const CHUNK = 9600;
		for (let at = 0; at < left.length; at += CHUNK) {
			const n = Math.min(CHUNK, left.length - at);
			const data = new Float32Array(n * 2);
			data.set(left.subarray(at, at + n), 0);
			data.set(right.subarray(at, at + n), n);
			const audio = new AudioData({
				format: 'f32-planar',
				sampleRate: AUDIO_RATE,
				numberOfFrames: n,
				numberOfChannels: 2,
				timestamp: Math.round((at / AUDIO_RATE) * 1e6),
				data
			});
			aenc.encode(audio);
			audio.close();
			await drain(aenc, 30);
		}
		await aenc.flush();
		if (failure) throw failure;

		// ---- archivo ----
		muxer.finalize();
		a.onProgress(1);
		const url = URL.createObjectURL(new Blob([muxer.target.buffer], { type: 'video/webm' }));
		const link = document.createElement('a');
		link.href = url;
		link.download = `${a.title.replace(/[^\p{L}\p{N}]+/gu, '-')}.webm`;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 10_000);
	} finally {
		if (venc && venc.state !== 'closed') venc.close();
		if (aenc && aenc.state !== 'closed') aenc.close();
		game.destroy();
	}
}
