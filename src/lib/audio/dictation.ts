// Grabar voz hablada para el dictado: MediaRecorder (con cancelación de eco y ruido, pensado para
// habla) y conversión a WAV mono de 16 kHz, el formato que pide Muse Voice Transcribe.

export interface Dictation {
	/** Corta la grabación y devuelve el WAV en base64. */
	stop(): Promise<string>;
	/** Corta sin devolver nada. */
	cancel(): void;
}

const RATE = 16000;

export async function startDictation(): Promise<Dictation> {
	const stream = await navigator.mediaDevices.getUserMedia({
		audio: {
			channelCount: 1,
			echoCancellation: true,
			noiseSuppression: true,
			autoGainControl: true
		}
	});
	const recorder = new MediaRecorder(stream);
	const chunks: Blob[] = [];
	recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
	recorder.start();
	const release = () => stream.getTracks().forEach((t) => t.stop());

	return {
		stop: () =>
			new Promise((resolve, reject) => {
				recorder.onstop = async () => {
					release();
					try {
						const blob = new Blob(chunks, { type: recorder.mimeType });
						resolve(toBase64(await toWav(blob)));
					} catch (e) {
						reject(e);
					}
				};
				recorder.stop();
			}),
		cancel: () => {
			recorder.onstop = release;
			if (recorder.state !== 'inactive') recorder.stop();
			else release();
		}
	};
}

/** Decodifica lo grabado y lo remuestrea a 16 kHz mono, PCM de 16 bits en un contenedor WAV. */
async function toWav(blob: Blob): Promise<Uint8Array> {
	const decoder = new AudioContext();
	const decoded = await decoder.decodeAudioData(await blob.arrayBuffer());
	void decoder.close();
	const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * RATE), RATE);
	const src = offline.createBufferSource();
	src.buffer = decoded;
	src.connect(offline.destination);
	src.start();
	const pcm = (await offline.startRendering()).getChannelData(0);

	const out = new DataView(new ArrayBuffer(44 + pcm.length * 2));
	const text = (at: number, s: string) =>
		[...s].forEach((c, i) => out.setUint8(at + i, c.charCodeAt(0)));
	text(0, 'RIFF');
	out.setUint32(4, 36 + pcm.length * 2, true);
	text(8, 'WAVE');
	text(12, 'fmt ');
	out.setUint32(16, 16, true);
	out.setUint16(20, 1, true); // PCM
	out.setUint16(22, 1, true); // mono
	out.setUint32(24, RATE, true);
	out.setUint32(28, RATE * 2, true);
	out.setUint16(32, 2, true);
	out.setUint16(34, 16, true);
	text(36, 'data');
	out.setUint32(40, pcm.length * 2, true);
	for (let i = 0; i < pcm.length; i++) {
		const v = Math.max(-1, Math.min(1, pcm[i]));
		out.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
	}
	return new Uint8Array(out.buffer);
}

function toBase64(bytes: Uint8Array): string {
	let s = '';
	for (let i = 0; i < bytes.length; i += 0x8000)
		s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(s);
}
