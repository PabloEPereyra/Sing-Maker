// Sonidos de la interfaz (como los clics de los menús de un juego): un "blip" corto al tocar un botón.
// No suenan mientras se canta, para no meterse en el micrófono, ni si la persona los apagó.
import { getContext } from './engine';

let muted = false;

/** Se llama con `true` mientras corre un ejercicio (cuenta atrás, escucha o juego). */
export function setUiSoundsMuted(value: boolean): void {
	muted = value;
}

function blip(from: number, to: number, volume: number): void {
	const ctx = getContext();
	if (ctx.state === 'suspended') void ctx.resume();
	const t0 = ctx.currentTime;
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.type = 'triangle';
	osc.frequency.setValueAtTime(from, t0);
	osc.frequency.exponentialRampToValueAtTime(to, t0 + 0.07);
	gain.gain.setValueAtTime(volume, t0);
	gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
	osc.connect(gain).connect(ctx.destination);
	osc.start(t0);
	osc.stop(t0 + 0.13);
}

/** Toque de un botón. */
export function uiClick(enabled: boolean): void {
	if (!enabled || muted) return;
	blip(660, 990, 0.07);
}
