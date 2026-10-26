// Tema "Cielo": un pájaro azul que vuela sobre un fondo de nubes.
import type { CharacterId } from '$lib/settings.svelte';
import type { CharacterState, Theme } from '../theme';

interface SpriteMeta {
	frames: number;
	frameWidth: number;
	frameHeight: number;
}

interface CharacterDef {
	sprite: string;
	/** Orden de cuadros del aleteo. */
	flap: number[];
	/** Cuadro parado en el suelo. */
	rest: number;
	/** La celda del sprite incluye las alas abiertas: se agranda para que el cuerpo mida lo mismo. */
	scale: number;
}

const CHARACTERS: Record<CharacterId, CharacterDef> = {
	// 4 cuadros: alas arriba, horizontales, plegadas (parado) y a media altura.
	bird: { sprite: 'character', flap: [0, 3, 1, 2, 1, 3], rest: 2, scale: 1 },
	// 6 cuadros en orden de aleteo; ninguno está parado, en el suelo usa el de alas abajo.
	bird2: { sprite: 'character2', flap: [0, 1, 2, 3, 4, 5], rest: 3, scale: 1.25 }
};
/** Velocidad del fondo respecto de las estrellas (paralaje). */
const BACKGROUND_SPEED = 0.3;

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const i = new Image();
		i.onload = () => resolve(i);
		i.onerror = reject;
		i.src = src;
	});
}

export function createSkyTheme(characterId: CharacterId = 'bird'): Theme {
	const character = CHARACTERS[characterId];
	let sprite: HTMLImageElement | null = null;
	let background: HTMLImageElement | null = null;
	let meta: SpriteMeta = { frames: 4, frameWidth: 144, frameHeight: 220 };

	return {
		id: `sky-${characterId}`,
		name: 'Cielo',

		async load() {
			const [img, bg, m] = await Promise.all([
				loadImage(`/themes/sky/${character.sprite}.png`),
				loadImage('/themes/sky/background.jpg'),
				fetch(`/themes/sky/${character.sprite}.json`).then((r) => r.json() as Promise<SpriteMeta>)
			]);
			sprite = img;
			background = bg;
			meta = m;
		},

		drawBackground(g, w, h, scroll, progress) {
			if (background) {
				// La imagen cubre el alto y se repite en espejo para que las uniones no se noten.
				const tw = (background.width / background.height) * h;
				const offset = (scroll * BACKGROUND_SPEED) % (tw * 2);
				for (let x = -offset, i = 0; x < w; x += tw, i++) {
					if (i % 2 === 0) g.drawImage(background, x, 0, tw, h);
					else {
						g.save();
						g.translate(x + tw, 0);
						g.scale(-1, 1);
						g.drawImage(background, 0, 0, tw, h);
						g.restore();
					}
				}
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

		drawGround(g, right, top, h) {
			// Isla de pasto de la que despega el pájaro; termina en un borde redondeado.
			const r = Math.min(28, (h - top) * 0.6);
			g.save();
			g.fillStyle = '#9a6b3f';
			g.beginPath();
			g.moveTo(-10, top + 8);
			g.lineTo(right - r, top + 8);
			g.quadraticCurveTo(right, top + 8, right, top + 8 + r);
			g.lineTo(right - r * 0.6, h + 10);
			g.lineTo(-10, h + 10);
			g.closePath();
			g.fill();
			g.fillStyle = '#5fbf4a';
			g.beginPath();
			g.moveTo(-10, top + 16);
			for (let x = -10; x < right - 6; x += 14) {
				g.quadraticCurveTo(x + 7, top + 22, x + 14, top + 16);
			}
			g.quadraticCurveTo(right + 4, top + 14, right - 2, top + 2);
			g.quadraticCurveTo(right - 6, top - 4, right - 18, top - 4);
			g.lineTo(-10, top - 4);
			g.closePath();
			g.fill();
			g.fillStyle = 'rgba(255,255,255,0.25)';
			g.fillRect(-10, top - 4, Math.max(0, right - 14), 4);
			g.restore();
		},

		drawPerch(g, x, y, width, info) {
			g.save();
			if (info.hint) {
				// Nota guía: línea punteada, suena pero no se canta.
				g.globalAlpha = info.past ? 0.25 : 0.6;
				g.strokeStyle = '#ffffff';
				g.lineWidth = 3;
				g.setLineDash([8, 8]);
				g.beginPath();
				g.moveTo(x, y);
				g.lineTo(x + width, y);
				g.stroke();
				g.setLineDash([]);
				g.fillStyle = '#ffffff';
				g.font = 'bold 18px system-ui, sans-serif';
				g.fillText('♪', x + 4, y - 8);
				g.restore();
				return;
			}
			// La percha es invisible: solo el nombre de la nota al comienzo, sobre los objetos.
			g.globalAlpha = info.past ? 0.35 : 0.95;
			g.font = '700 12px system-ui, sans-serif';
			g.lineJoin = 'round';
			g.lineWidth = 3;
			g.strokeStyle = 'rgba(20,35,80,0.55)';
			g.strokeText(info.label, x, y - 22);
			g.fillStyle = '#ffffff';
			g.fillText(info.label, x, y - 22);
			g.restore();
		},

		drawCharacter(g, x, y, size, time, state: CharacterState) {
			if (!sprite) return;
			// En el aire aletea siempre (más rápido cuando canta); en el suelo, alas plegadas.
			const flapRate = state.onTarget ? 12 : state.singing ? 10 : 7;
			const frame = state.flying
				? character.flap[Math.floor(time * flapRate) % character.flap.length]
				: character.rest;
			const h = size * character.scale;
			const w = (meta.frameWidth / meta.frameHeight) * h;
			g.save();
			if (state.flying) {
				// Sin voz flota en el lugar con un leve vaivén.
				g.translate(x, y + (state.singing ? 0 : Math.sin(time * 3) * 3));
				g.rotate(Math.max(-0.35, Math.min(0.35, state.vy / 900)));
			} else {
				g.translate(x, y + Math.sin(time * 2.2) * 1.5);
			}
			if (state.onTarget) {
				g.shadowColor = 'rgba(255,230,120,0.9)';
				g.shadowBlur = 22;
			}
			g.drawImage(
				sprite,
				frame * meta.frameWidth,
				0,
				meta.frameWidth,
				meta.frameHeight,
				-w * 0.55,
				-h * 0.5,
				w,
				h
			);
			g.restore();
		}
	};
}
