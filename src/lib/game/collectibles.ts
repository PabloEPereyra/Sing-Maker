// Objetos para recolectar, independientes del tema: se elige uno en "Personalizar".
// Las estrellas se dibujan con código; las notas y las zanahorias usan hojas de sprites.
import type { CollectibleId } from '$lib/settings.svelte';
import type { CollectibleState } from './theme';

export interface CollectibleSkin {
	id: CollectibleId;
	load(): Promise<void>;
	/** `variant` agrupa los objetos de una misma nota (p. ej. mismo color). */
	draw(
		g: CanvasRenderingContext2D,
		x: number,
		y: number,
		size: number,
		state: CollectibleState,
		age: number,
		time: number,
		variant: number
	): void;
}

function starPath(g: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number): void {
	g.beginPath();
	for (let i = 0; i < 10; i++) {
		const a = rot + (i * Math.PI) / 5 - Math.PI / 2;
		const rr = i % 2 === 0 ? r : r * 0.45;
		g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
	}
	g.closePath();
}

/** Chispas que se abren al recoger (comunes a todos los objetos). */
function sparkles(g: CanvasRenderingContext2D, x: number, y: number, t: number): void {
	g.fillStyle = '#fff7b0';
	for (let i = 0; i < 6; i++) {
		const a = (i / 6) * Math.PI * 2;
		g.beginPath();
		g.arc(x + Math.cos(a) * t * 34, y + Math.sin(a) * t * 34, 3 * (1 - t), 0, Math.PI * 2);
		g.fill();
	}
}

const stars: CollectibleSkin = {
	id: 'stars',
	async load() {},
	draw(g, x, y, size, state, age, time) {
		g.save();
		if (state === 'collected') {
			const t = Math.min(1, age / 0.6);
			g.globalAlpha = 1 - t;
			g.fillStyle = '#ffe14d';
			starPath(g, x, y - t * 50, size * (1 + t * 0.6), t * 3);
			g.fill();
			sparkles(g, x, y, t);
		} else if (state === 'missed') {
			// Lo perdido sigue a la vista, apagado, hasta salir por la izquierda.
			g.globalAlpha = 0.65;
			g.fillStyle = '#c9d3e0';
			starPath(g, x, y, size * 0.85, 0);
			g.fill();
			g.strokeStyle = '#8c98ad';
			g.lineWidth = 1.5;
			g.stroke();
		} else {
			const pulse = 1 + 0.08 * Math.sin(time * 6 + x * 0.05);
			g.shadowColor = 'rgba(255,220,60,0.8)';
			g.shadowBlur = 12;
			g.fillStyle = '#ffd23f';
			starPath(g, x, y, size * pulse, Math.sin(time * 2 + x) * 0.15);
			g.fill();
			g.shadowBlur = 0;
			g.strokeStyle = '#e09b00';
			g.lineWidth = 1.5;
			g.stroke();
		}
		g.restore();
	}
};

interface SpriteMeta {
	frames: number;
	frameWidth: number;
	frameHeight: number;
}

interface SpriteOptions {
	/** Cuadros que se usan como variantes (uno por nota, en rotación). Por defecto, todos. */
	variants?: number[];
	/** Cuadro que se muestra al recogerlo (si no, el mismo de la variante). */
	collected?: number;
}

/** Objeto a partir de una hoja de sprites en `static/collectibles/<id>.png`. */
function spriteSkin(id: CollectibleId, scale: number, opts: SpriteOptions = {}): CollectibleSkin {
	let img: HTMLImageElement | null = null;
	let meta: SpriteMeta = { frames: 1, frameWidth: 1, frameHeight: 1 };
	return {
		id,
		async load() {
			if (img) return;
			const [i, m] = await Promise.all([
				new Promise<HTMLImageElement>((resolve, reject) => {
					const el = new Image();
					el.onload = () => resolve(el);
					el.onerror = reject;
					el.src = `/collectibles/${id}.png`;
				}),
				fetch(`/collectibles/${id}.json`).then((r) => r.json() as Promise<SpriteMeta>)
			]);
			img = i;
			meta = m;
		},
		draw(g, x, y, size, state, age, time, variant) {
			if (!img) return;
			const pool = opts.variants ?? Array.from({ length: meta.frames }, (_, i) => i);
			let frame = pool[((variant % pool.length) + pool.length) % pool.length];
			if (state === 'collected' && opts.collected !== undefined) frame = opts.collected;
			const h = size * scale;
			const w = (meta.frameWidth / meta.frameHeight) * h;
			const blit = (cx: number, cy: number, k: number) =>
				g.drawImage(
					img!,
					frame * meta.frameWidth,
					0,
					meta.frameWidth,
					meta.frameHeight,
					cx - (w * k) / 2,
					cy - (h * k) / 2,
					w * k,
					h * k
				);
			g.save();
			if (state === 'collected') {
				const t = Math.min(1, age / 0.6);
				g.globalAlpha = 1 - t;
				blit(x, y - t * 50, 1 + t * 0.5);
				sparkles(g, x, y, t);
			} else if (state === 'missed') {
				// Lo perdido sigue a la vista, apagado, hasta salir por la izquierda.
				g.globalAlpha = 0.6;
				g.filter = 'grayscale(1)';
				blit(x, y, 0.85);
			} else {
				blit(x, y + Math.sin(time * 4 + x * 0.05) * 2, 1);
			}
			g.restore();
		}
	};
}

export const COLLECTIBLES: Record<CollectibleId, CollectibleSkin> = {
	stars,
	notes: spriteSkin('notes', 2.3),
	// Derecha e inclinada se alternan entre notas; la de brillos aparece al recogerla.
	carrots: spriteSkin('carrots', 2.5, { variants: [0, 1], collected: 2 })
};
