// Tema "Cielo": un pájaro azul que vuela sobre un fondo de nubes.
import type { CharacterId, StartId } from '$lib/settings.svelte';
import type { CharacterState, Theme } from '../theme';

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

const CHARACTERS: Record<CharacterId, CharacterDef> = {
	// Parado: primer cuadro de volando.png; volando: los 6 cuadros de volando2.png.
	bird: { rest: 'bird-rest', fly: 'bird-fly', flap: [0, 1, 2, 3, 4, 5] }
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

/**
 * Árbol de partida: se dibuja el doble de alto que lo visible para que solo asome la mitad
 * superior (la copa), como si el tronco viniera de más abajo. TREE_VISIBLE es la parte del alto del
 * canvas que ocupa lo que se ve; TREE_SINK, cuánto se hunde el personaje entre las hojas.
 */
const TREE_VISIBLE = 0.5;
const TREE_SINK = 0.06;

export function createSkyTheme(
	characterId: CharacterId = 'bird',
	startId: StartId = 'tree1'
): Theme {
	const character = CHARACTERS[characterId];
	let tree: { img: HTMLImageElement; meta: SpriteMeta } | null = null;
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
		id: `sky-${characterId}-${startId}`,
		name: 'Cielo',

		async load() {
			[rest, fly, background] = await Promise.all([
				loadSheet(character.rest),
				loadSheet(character.fly),
				loadImage('/themes/sky/background.jpg')
			]);
			tree = await loadSheet(startId);
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

		startSurface(h) {
			// La copa del árbol: el pájaro se apoya un poco hundido entre las hojas.
			const treeH = (h * TREE_VISIBLE) / 0.5;
			return h - h * TREE_VISIBLE + treeH * TREE_SINK;
		},

		drawStart(g, x, _w, h) {
			// Copa bajo el pájaro; la mitad inferior del árbol queda fuera del canvas.
			if (!tree) return;
			const treeH = (h * TREE_VISIBLE) / 0.5;
			const treeW = (tree.meta.frameWidth / tree.meta.frameHeight) * treeH;
			if (x + treeW / 2 < 0) return;
			g.drawImage(tree.img, x - treeW / 2, h - h * TREE_VISIBLE, treeW, treeH);
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
			if (!rest || !fly) return;
			g.save();
			if (state.onTarget) {
				g.shadowColor = 'rgba(255,230,120,0.9)';
				g.shadowBlur = 22;
			}
			if (!state.flying) {
				// Parado: los pies apoyados en el suelo (el motor pasa el centro a 0,42 del tamaño).
				const bob = Math.sin(time * 2.2) * 1.2;
				blit(g, rest, 0, x, y + size * 0.44 - size + bob, size);
			} else {
				// En el aire aletea siempre (más rápido cuando canta). El alto se ajusta para que el
				// cuerpo mida lo mismo que parado (misma relación pico/alto).
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
			}
			g.restore();
		}
	};
}
