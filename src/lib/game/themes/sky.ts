// Tema "Cielo": un pájaro azul que vuela y junta estrellas sobre un fondo de nubes.
import type { CharacterState, Theme } from '../theme';

interface SpriteMeta {
	frames: number;
	frameWidth: number;
	frameHeight: number;
}

/** Orden de cuadros del aleteo: alas arriba → medio → horizontal → abajo → horizontal → medio. */
const FLAP = [0, 3, 1, 2, 1, 3];
/** Cuadro en reposo: alas plegadas. */
const REST_FRAME = 2;
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

export function createSkyTheme(): Theme {
	let sprite: HTMLImageElement | null = null;
	let background: HTMLImageElement | null = null;
	let meta: SpriteMeta = { frames: 4, frameWidth: 144, frameHeight: 220 };

	function star(g: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number): void {
		g.beginPath();
		for (let i = 0; i < 10; i++) {
			const a = rot + (i * Math.PI) / 5 - Math.PI / 2;
			const rr = i % 2 === 0 ? r : r * 0.45;
			g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
		}
		g.closePath();
	}

	return {
		id: 'sky',
		name: 'Cielo',
		collectibles: 'estrellas',

		async load() {
			const [img, bg, m] = await Promise.all([
				loadImage('/themes/sky/character.png'),
				loadImage('/themes/sky/background.jpg'),
				fetch('/themes/sky/character.json').then((r) => r.json() as Promise<SpriteMeta>)
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
			// Solo el nombre de la nota bajo las estrellas.
			g.globalAlpha = info.past ? 0.4 : 0.85;
			g.fillStyle = 'rgba(25,45,90,0.8)';
			g.font = '600 12px system-ui, sans-serif';
			g.fillText(info.label, x + 2, y + 26);
			g.restore();
		},

		drawCollectible(g, x, y, size, state, age, time) {
			g.save();
			if (state === 'collected') {
				// Sube, gira y se desvanece con chispas.
				const t = Math.min(1, age / 0.6);
				g.globalAlpha = 1 - t;
				const yy = y - t * 50;
				g.fillStyle = '#ffe14d';
				star(g, x, yy, size * (1 + t * 0.6), t * 3);
				g.fill();
				g.fillStyle = '#fff7b0';
				for (let i = 0; i < 6; i++) {
					const a = (i / 6) * Math.PI * 2;
					g.beginPath();
					g.arc(x + Math.cos(a) * t * 34, y + Math.sin(a) * t * 34, 3 * (1 - t), 0, Math.PI * 2);
					g.fill();
				}
			} else if (state === 'missed') {
				g.globalAlpha = Math.max(0.15, 0.45 - age);
				g.fillStyle = '#c9d3e0';
				star(g, x, y, size * 0.8, 0);
				g.fill();
			} else {
				const pulse = 1 + 0.08 * Math.sin(time * 6 + x * 0.05);
				g.shadowColor = 'rgba(255,220,60,0.8)';
				g.shadowBlur = 12;
				g.fillStyle = '#ffd23f';
				star(g, x, y, size * pulse, Math.sin(time * 2 + x) * 0.15);
				g.fill();
				g.shadowBlur = 0;
				g.strokeStyle = '#e09b00';
				g.lineWidth = 1.5;
				g.stroke();
			}
			g.restore();
		},

		drawCharacter(g, x, y, size, time, state: CharacterState) {
			if (!sprite) return;
			// En el aire aletea siempre (más rápido cuando canta); en el suelo, alas plegadas.
			const flapRate = state.onTarget ? 12 : state.singing ? 10 : 7;
			const frame = state.flying ? FLAP[Math.floor(time * flapRate) % FLAP.length] : REST_FRAME;
			const h = size;
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
