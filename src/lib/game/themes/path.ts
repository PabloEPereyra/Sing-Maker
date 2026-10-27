// Tema "Sendero": una coneja que camina por un bosque. Es un personaje terrestre: las notas son
// plataformas (troncos con musgo), salta en arco entre ellas y en los silencios baja al sendero.
import type { CharacterState, Theme } from '../theme';
import { drawHintPerch, drawPerchLabel, drawScrollingBackground, loadImage } from './common';

interface SpriteMeta {
	frames: number;
	frameWidth: number;
	frameHeight: number;
}

type Sheet = { img: HTMLImageElement; meta: SpriteMeta };

/** Cuadros de bunny-move: 0–3 caminar, 4 agachada, 5 recogida (bajando), 6 estirada (subiendo). */
const WALK = [0, 1, 2, 3];
const CROUCH = 4;
const FALLING = 5;
const RISING = 6;
/** Cuadros por segundo del paso. */
const WALK_FPS = 8;
/** Tiempo (s) que se ve la pose agachada al aterrizar. */
const LANDING_SEC = 0.09;
/** Velocidad del fondo respecto de las plataformas (paralaje). */
const BACKGROUND_SPEED = 0.45;
/** Altura del sendero de tierra en la imagen de fondo (proporción del alto). */
const GROUND = 0.865;
/** El sprite incluye las orejas: se dibuja más alto que el tamaño base del personaje. */
const SPRITE_SCALE = 1.3;

export function createPathTheme(): Theme {
	let rest: Sheet | null = null;
	let move: Sheet | null = null;
	let background: HTMLImageElement | null = null;

	const loadSheet = async (name: string): Promise<Sheet> => {
		const [img, meta] = await Promise.all([
			loadImage(`/themes/path/${name}.png`),
			fetch(`/themes/path/${name}.json`).then((r) => r.json() as Promise<SpriteMeta>)
		]);
		return { img, meta };
	};

	/** Dibuja un cuadro con los pies (borde inferior de la tira) en `feetY`. */
	function blit(
		g: CanvasRenderingContext2D,
		sheet: Sheet,
		frame: number,
		x: number,
		feetY: number,
		h: number
	) {
		const { meta } = sheet;
		const w = (meta.frameWidth / meta.frameHeight) * h;
		g.drawImage(
			sheet.img,
			frame * meta.frameWidth,
			0,
			meta.frameWidth,
			meta.frameHeight,
			x - w * 0.5,
			feetY - h,
			w,
			h
		);
	}

	return {
		id: 'path-bunny',
		name: 'Sendero',
		movement: 'walk',

		async load() {
			[rest, move, background] = await Promise.all([
				loadSheet('bunny-rest'),
				loadSheet('bunny-move'),
				loadImage('/themes/path/background.jpg')
			]);
		},

		drawBackground(g, w, h, scroll, progress) {
			if (background) drawScrollingBackground(g, background, w, h, scroll * BACKGROUND_SPEED);
			else {
				g.fillStyle = '#9fd38a';
				g.fillRect(0, 0, w, h);
			}
			// Hacia el final la luz del bosque se vuelve dorada, como al atardecer.
			if (progress > 0) {
				const warm = g.createLinearGradient(0, 0, 0, h);
				warm.addColorStop(0, `rgba(255,190,120,${0.25 * progress})`);
				warm.addColorStop(1, `rgba(200,110,60,${0.2 * progress})`);
				g.fillStyle = warm;
				g.fillRect(0, 0, w, h);
			}
		},

		startSurface(h) {
			return h * GROUND;
		},

		drawStart() {
			// El punto de partida es el propio sendero.
		},

		drawPerch(g, x, y, width, info) {
			if (info.hint) {
				drawHintPerch(g, x, y, width, info.past);
				return;
			}
			// Plataforma: un tronco con musgo arriba, donde apoya los pies.
			const top = info.footY;
			const th = 11;
			g.save();
			g.globalAlpha = info.past ? 0.55 : 1;
			g.fillStyle = 'rgba(40,30,10,0.18)';
			g.beginPath();
			g.ellipse(x + width / 2, top + th + 5, width / 2, 4, 0, 0, Math.PI * 2);
			g.fill();
			const wood = g.createLinearGradient(0, top, 0, top + th);
			wood.addColorStop(0, '#b07a45');
			wood.addColorStop(1, '#7a4f2a');
			g.fillStyle = wood;
			g.beginPath();
			g.roundRect(x, top, width, th, th / 2);
			g.fill();
			g.fillStyle = '#7fbf4d';
			g.beginPath();
			g.roundRect(x + 2, top - 2, width - 4, 5, 2.5);
			g.fill();
			g.restore();
			drawPerchLabel(g, x, y, info.label, info.past, 'rgba(30,50,20,0.6)');
		},

		drawCharacter(g, x, y, size, time, state: CharacterState) {
			if (!rest || !move) return;
			// El motor pasa el centro del cuerpo; los pies quedan a 0,42 del tamaño hacia abajo.
			const feetY = y + size * 0.42;
			const h = size * SPRITE_SCALE;
			g.save();
			if (state.onTarget) {
				g.shadowColor = 'rgba(255,230,120,0.9)';
				g.shadowBlur = 22;
			}
			if (!state.flying) {
				// Esperando en el sendero, de perfil, con una leve respiración.
				const breathe = 1 + Math.sin(time * 2.2) * 0.008;
				blit(g, rest, 0, x, feetY, h * breathe);
			} else if (state.airborne) {
				blit(g, move, state.vy < 0 ? RISING : FALLING, x, feetY, h);
			} else if (state.sinceLanding < LANDING_SEC) {
				blit(g, move, CROUCH, x, feetY, h);
			} else if (state.moving) {
				blit(g, move, WALK[Math.floor(time * WALK_FPS) % WALK.length], x, feetY, h);
			} else {
				blit(g, rest, 0, x, feetY, h);
			}
			g.restore();
		}
	};
}
