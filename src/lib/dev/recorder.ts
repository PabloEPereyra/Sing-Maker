// SOLO DESARROLLO: graba el canvas del juego (imagen) y el audio de la app en un .webm.
// Se importa únicamente detrás de `import.meta.env.DEV`, así que no entra en el build de producción.

import { getRecordingAudio } from '$lib/audio/engine';

export interface Recording {
	/** Corta la grabación y baja el archivo (con `save = false`, la descarta). */
	finish(save?: boolean): void;
}

function pickMime(): string {
	const options = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
	return options.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}

export function startRecording(canvas: HTMLCanvasElement, name: string): Recording {
	const stream = new MediaStream([
		...canvas.captureStream(60).getVideoTracks(),
		...getRecordingAudio().getAudioTracks()
	]);
	const recorder = new MediaRecorder(stream, {
		mimeType: pickMime(),
		videoBitsPerSecond: 12_000_000,
		audioBitsPerSecond: 192_000
	});
	const chunks: Blob[] = [];
	let save = true;
	recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
	recorder.onstop = () => {
		stream.getTracks().forEach((t) => t.stop());
		if (!save || !chunks.length) return;
		const url = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = `${name.replace(/[^\p{L}\p{N}]+/gu, '-')}.webm`;
		a.click();
		setTimeout(() => URL.revokeObjectURL(url), 10_000);
	};
	recorder.start(1000);
	return {
		finish(s = true) {
			save = s;
			if (recorder.state !== 'inactive') recorder.stop();
		}
	};
}
