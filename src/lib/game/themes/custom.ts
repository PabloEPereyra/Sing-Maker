// Tema de un personaje creado por el usuario con IA. Reusa el escenario de los temas de fábrica (Sendero
// para los caminantes, Cielo para los voladores) y solo cambia el personaje: sus tiras de cuadros vienen
// del dispositivo (ver character/store.svelte.ts) y se dibujan con las mismas poses que la coneja y el pájaro.
import type { CharacterRecord, SheetRecord } from '$lib/character/store.svelte';
import type { StartId } from '$lib/settings.svelte';
import type { CharacterState, Theme } from '../theme';
import { loadImage } from './common';
import { createPathTheme } from './path';
import { createSkyTheme } from './sky';

interface Sheet {
	img: HTMLImageElement;
	rec: SheetRecord;
}

/** Alto de referencia de un cuadro de fábrica: los cuadros propios se dibujan a esta escala. */
const REF_H = 240;
/** Caminantes: el sprite incluye las orejas y se dibuja más grande que el tamaño base. */
const WALK_SCALE = 1.3;
const RUN_FPS = 12;
/** Tiempo (s) que se ve la pose de despegue al aterrizar. */
const LANDING_SEC = 0.09;

async function sheetOf(rec: SheetRecord): Promise<Sheet> {
	const url = URL.createObjectURL(rec.blob);
	try {
		return { img: await loadImage(url), rec };
	} finally {
		// La imagen ya está decodificada; la URL temporal no hace falta.
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}
}

/** Dibuja un cuadro con el centro-inferior en (x, feetY) y la escala `k` (px por px de la hoja). */
function blitFeet(
	g: CanvasRenderingContext2D,
	s: Sheet,
	frame: number,
	x: number,
	feetY: number,
	k: number
) {
	const { frameWidth: fw, frameHeight: fh } = s.rec;
	g.drawImage(s.img, frame * fw, 0, fw, fh, x - (fw * k) / 2, feetY - fh * k, fw * k, fh * k);
}

/** Dibuja un cuadro centrado en (x, y). */
function blitCenter(g: CanvasRenderingContext2D, s: Sheet, frame: number, k: number) {
	const { frameWidth: fw, frameHeight: fh } = s.rec;
	g.drawImage(s.img, frame * fw, 0, fw, fh, (-fw * k) / 2, (-fh * k) / 2, fw * k, fh * k);
}

export function createCustomTheme(rec: CharacterRecord, start: StartId): Theme {
	const base: Theme = rec.movement === 'walk' ? createPathTheme() : createSkyTheme('bird', start);
	let stand: Sheet | null = null;
	let move: Sheet | null = null;
	let jump: Sheet | null = null;

	return {
		...base,
		id: `custom-${rec.id}-${start}`,

		async load() {
			await base.load();
			stand = await sheetOf(rec.stand);
			move = await sheetOf(rec.move);
			jump = rec.jump ? await sheetOf(rec.jump) : null;
		},

		drawCharacter(g, x, y, size, time, state: CharacterState) {
			if (!stand || !move) return;
			const walk = rec.movement === 'walk';
			const k = (size * (walk ? WALK_SCALE : 1.35)) / REF_H;
			// El motor pasa el centro del cuerpo; los pies quedan a ~0,42 del tamaño hacia abajo.
			const feetY = y + size * 0.42;
			g.save();
			if (state.onTarget) {
				g.shadowColor = 'rgba(255,230,120,0.9)';
				g.shadowBlur = 22;
			}
			const front = Math.min(1, stand.rec.frames - 1);
			if (!state.flying) {
				// Esperando de perfil con una leve respiración, o de frente mientras escucha el ejercicio.
				const breathe = 1 + Math.sin(time * 2.2) * 0.008;
				blitFeet(g, stand, state.facingFront ? front : 0, x, feetY, k * breathe);
			} else if (!walk) {
				// Volador: aletea siempre (más rápido cuando canta), centrado, inclinado según sube o baja.
				const rate = (state.onTarget ? 12 : state.singing ? 10 : 7) * (move.rec.frames / 6);
				g.translate(x, y + (state.singing ? 0 : Math.sin(time * 3) * 3));
				g.rotate(Math.max(-0.35, Math.min(0.35, state.vy / 900)));
				blitCenter(g, move, Math.floor(time * rate) % move.rec.frames, k);
			} else if (state.airborne) {
				const n = jump ? jump.rec.frames : 0;
				if (jump && n > 0)
					blitFeet(
						g,
						jump,
						state.vy < 0 ? Math.round((n - 1) * 0.4) : Math.round((n - 1) * 0.8),
						x,
						feetY,
						k
					);
				else blitFeet(g, move, 0, x, feetY, k);
			} else if (state.sinceLanding < LANDING_SEC && jump) {
				blitFeet(g, jump, 0, x, feetY, k);
			} else if (state.moving) {
				blitFeet(g, move, Math.floor(time * RUN_FPS) % move.rec.frames, x, feetY, k);
			} else {
				blitFeet(g, stand, 0, x, feetY, k);
			}
			g.restore();
		}
	};
}
