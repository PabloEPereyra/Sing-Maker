// Tema "Cielo": un pájaro azul que vuela sobre un fondo de nubes.
import type { CharacterId } from '$lib/settings.svelte';
import type { CharacterState, Theme } from '../theme';
import { drawHintPerch, drawPerchLabel, drawScrollingBackground, loadImage } from './common';

interface SpriteMeta {
	frames: number;
	frameWidth: number;
	frameHeight: number;
	/** Ancho del pico en px del sprite: sirve para igualar el tamaño del cuerpo entre hojas. */
	beakWidth?: number;
}

interface CharacterDef {
	/** Hoja con el personaje parado (un cuadro, con los pies al borde inferior). */
	rest: string;
	/** Hoja con el ciclo de vuelo. */
	fly: string;
	/** Orden de cuadros del aleteo. */
	flap: number[];
}

const CHARACTERS: Partial<Record<CharacterId, CharacterDef>> = {
	// Parado: primer cuadro de volando.png; volando: los 6 cuadros de volando2.png.
	bird: { rest: 'bird-rest', fly: 'bird-fly', flap: [0, 1, 2, 3, 4, 5] }
};
/** Velocidad del fondo respecto de las estrellas (paralaje). */
const BACKGROUND_SPEED = 0.3;

export function createSkyTheme(characterId: CharacterId = 'bird'): Theme {
	const character = CHARACTERS[characterId] ?? CHARACTERS.bird!;
	let rest: { img: HTMLImageElement; meta: SpriteMeta } | null = null;
	let fly: { img: HTMLImageElement; meta: SpriteMeta } | null = null;
	let background: HTMLImageElement | null = null;

	const loadSheet = async (name: string) => {
		const [img, meta] = await Promise.all([
			loadImage(`/themes/sky/${name}.png`),
			fetch(`/themes/sky/${name}.json`).then((r) => r.json() as Promise<SpriteMeta>)
		]);
		return { img, meta };
	};

	function blit(
		g: CanvasRenderingContext2D,
		sheet: { img: HTMLImageElement; meta: SpriteMeta },
		frame: number,
		x: number,
		y: number,
		h: number
	): void {
		const { meta } = sheet;
		const w = (meta.frameWidth / meta.frameHeight) * h;
		g.drawImage(
			sheet.img,
			frame * meta.frameWidth,
			0,
			meta.frameWidth,
			meta.frameHeight,
			x - w * 0.55,
			y,
			w,
			h
		);
	}

	return {
		id: `sky-${characterId}`,
		name: 'Cielo',
		movement: 'fly',

		async load() {
			[rest, fly, background] = await Promise.all([
				loadSheet(character.rest),
				loadSheet(character.fly),
				loadImage('/themes/sky/background.jpg')
			]);
		},

		drawBackground(g, w, h, scroll, progress) {
			if (background) {
				drawScrollingBackground(g, background, w, h, scroll * BACKGROUND_SPEED);
			} else {
				g.fillStyle = '#6cb8ec';
				g.fillRect(0, 0, w, h);
			}
			// Hacia el final del ejercicio el cielo se entibia como un atardecer.
			if (progress > 0) {
				const warm = g.createLinearGradient(0, 0, 0, h);
				warm.addColorStop(0, `rgba(140,90,200,${0.3 * progress})`);
				warm.addColorStop(1, `rgba(255,170,110,${0.4 * progress})`);
				g.fillStyle = warm;
				g.fillRect(0, 0, w, h);
			}
		},

		startSurface(h) {
			// Sin objeto de partida: antes de empezar el personaje ya vuela, flotando a esta altura.
			return h * 0.72;
		},

		drawStart() {
			// Sin objeto de partida.
		},

		drawPerch(g, x, y, width, info) {
			// La percha es invisible: solo el nombre de la nota al comienzo, sobre los objetos.
			if (info.hint) drawHintPerch(g, x, y, width, info.past);
			else drawPerchLabel(g, x, y, info.label, info.past);
		},

		drawCharacter(g, x, y, size, time, state: CharacterState) {
			if (!rest || !fly) return;
			g.save();
			if (state.onTarget) {
				g.shadowColor = 'rgba(255,230,120,0.9)';
				g.shadowBlur = 22;
			}
			// Aletea siempre, también antes de empezar (más rápido cuando canta). El alto se ajusta para que el
			// cuerpo mida lo mismo que en la hoja de reposo (misma relación pico/alto).
			const k =
				rest.meta.beakWidth && fly.meta.beakWidth
					? rest.meta.beakWidth /
						rest.meta.frameHeight /
						(fly.meta.beakWidth / fly.meta.frameHeight)
					: 1;
			const h = size * k;
			const flapRate = state.onTarget ? 12 : state.singing ? 10 : 7;
			const frame = character.flap[Math.floor(time * flapRate) % character.flap.length];
			// Sin voz flota en el lugar con un leve vaivén.
			g.translate(x, y + (state.singing ? 0 : Math.sin(time * 3) * 3));
			g.rotate(Math.max(-0.35, Math.min(0.35, state.vy / 900)));
			blit(g, fly, frame, 0, -h * 0.5, h);
			g.restore();
		}
	};
}
