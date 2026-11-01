// Plataformas de los personajes terrestres sobre un fondo creado con IA: los colores salen del propio fondo y la
// forma (tronco, piedra, hielo…) la elige Spark al mirar la imagen. Todo se dibuja por código, sin imágenes nuevas.

import { PLATFORM_STYLES, type PlatformStyle } from '../../character/spec';
export { PLATFORM_STYLES, type PlatformStyle };

export type Rgb = [number, number, number];

export interface PlatformPalette {
	/** Color del cuerpo, elegido para que se distinga del fondo que tiene detrás. */
	body: Rgb;
	/** Borde superior, donde apoya los pies (más claro que el cuerpo). */
	top: Rgb;
	/** Sombras y grietas. */
	dark: Rgb;
}

/** Los colores del tronco con musgo de fábrica: se usan si no se puede medir el fondo. */
export const DEFAULT_PALETTE: PlatformPalette = {
	body: [176, 122, 69],
	top: [127, 191, 77],
	dark: [122, 79, 42]
};

// ---------- color ----------

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function rgbToHsl([r, g, b]: Rgb): [number, number, number] {
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	if (max === min) return [0, 0, l];
	const d = max - min;
	const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	const h =
		max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
	return [h / 6, s, l];
}

export function hslToRgb(h: number, s: number, l: number): Rgb {
	if (s === 0) return [Math.round(l * 255), Math.round(l * 255), Math.round(l * 255)];
	const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
	const p = 2 * l - q;
	const channel = (t: number) => {
		t = (t + 1) % 1;
		const v =
			t < 1 / 6
				? p + (q - p) * 6 * t
				: t < 1 / 2
					? q
					: t < 2 / 3
						? p + (q - p) * (2 / 3 - t) * 6
						: p;
		return Math.round(v * 255);
	};
	return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)];
}

const mean = (px: Rgb[]): Rgb | null =>
	px.length
		? ([0, 1, 2].map((c) => Math.round(px.reduce((a, p) => a + p[c], 0) / px.length)) as Rgb)
		: null;

export const css = ([r, g, b]: Rgb, a = 1): string =>
	a >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`;

/** Mezcla `a` hacia `b` (t = 0 deja `a`). */
const mix = (a: Rgb, b: Rgb, t: number): Rgb =>
	[0, 1, 2].map((c) => Math.round(a[c] + (b[c] - a[c]) * t)) as Rgb;

/**
 * Colores de la plataforma a partir de dos muestras del fondo: la franja del suelo (de ahí sale el tono) y lo
 * que hay detrás de las plataformas (para que el cuerpo se distinga y las notas se lean).
 */
export function paletteFrom(ground: Rgb[], backdrop: Rgb[]): PlatformPalette {
	const base = mean(ground);
	if (!base) return DEFAULT_PALETTE;
	const back = mean(backdrop);
	const [h, s0, l0] = rgbToHsl(base);
	const s = clamp(s0, 0.15, 0.8);
	let l = clamp(l0, 0.25, 0.7);
	if (back) {
		const lb = rgbToHsl(back)[2];
		// Poco contraste con el fondo: se oscurece o se aclara hacia el lado que deja más margen.
		if (Math.abs(l - lb) < 0.2) l = clamp(lb > 0.5 ? lb - 0.28 : lb + 0.28, 0.12, 0.9);
	}
	const body = hslToRgb(h, s, l);
	// El borde de arriba se corre un poco hacia el tono del fondo (el musgo del tronco, la escarcha de la roca).
	let top = hslToRgb(h, clamp(s + 0.1, 0, 1), clamp(l + 0.15, 0, 0.92));
	if (back)
		top = mix(
			top,
			hslToRgb(rgbToHsl(back)[0], clamp(s + 0.15, 0, 1), clamp(l + 0.12, 0, 0.9)),
			0.35
		);
	return { body, top, dark: hslToRgb(h, s, clamp(l - 0.17, 0.05, 0.9)) };
}

/** Mide el fondo (ya cargado en el navegador) y devuelve la paleta; si no se puede leer, la de fábrica. */
export function samplePalette(img: CanvasImageSource, ground: number): PlatformPalette {
	try {
		const w = 64;
		const h = 36;
		const canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		const g = canvas.getContext('2d', { willReadFrequently: true });
		if (!g) return DEFAULT_PALETTE;
		g.drawImage(img, 0, 0, w, h);
		const data = g.getImageData(0, 0, w, h).data;
		const rows = (from: number, to: number): Rgb[] => {
			const out: Rgb[] = [];
			for (let y = from; y < to; y++)
				for (let x = 0; x < w; x++) {
					const i = (y * w + x) * 4;
					out.push([data[i], data[i + 1], data[i + 2]]);
				}
			return out;
		};
		const gy = Math.round(clamp(ground, 0.5, 0.95) * h);
		return paletteFrom(rows(Math.min(h - 1, gy + 1), h), rows(Math.round(h * 0.3), gy));
	} catch {
		return DEFAULT_PALETTE;
	}
}

// ---------- dibujo ----------

/**
 * Una plataforma de `width` x `th` px con la cara de arriba en `top` (ahí apoya los pies el personaje).
 * `past`: ya pasó por la posición del personaje, se ve más tenue.
 */
export function drawPlatform(
	g: CanvasRenderingContext2D,
	style: PlatformStyle,
	x: number,
	top: number,
	width: number,
	th: number,
	pal: PlatformPalette,
	past: boolean
): void {
	g.save();
	g.globalAlpha = past ? 0.55 : 1;
	// Sombra suave en el piso, igual para todas.
	g.fillStyle = css(pal.dark, 0.2);
	g.beginPath();
	g.ellipse(x + width / 2, top + th + 5, width / 2, 4, 0, 0, Math.PI * 2);
	g.fill();
	DRAW[style](g, x, top, width, th, pal);
	g.restore();
}

const vertical = (g: CanvasRenderingContext2D, top: number, th: number, a: Rgb, b: Rgb) => {
	const gr = g.createLinearGradient(0, top, 0, top + th);
	gr.addColorStop(0, css(a));
	gr.addColorStop(1, css(b));
	return gr;
};

const DRAW: Record<
	PlatformStyle,
	(
		g: CanvasRenderingContext2D,
		x: number,
		top: number,
		w: number,
		th: number,
		pal: PlatformPalette
	) => void
> = {
	log(g, x, top, w, th, pal) {
		g.fillStyle = vertical(g, top, th, pal.body, pal.dark);
		g.beginPath();
		g.roundRect(x, top, w, th, th / 2);
		g.fill();
		g.fillStyle = css(pal.top);
		g.beginPath();
		g.roundRect(x + 2, top - 2, w - 4, 5, 2.5);
		g.fill();
	},

	stone(g, x, top, w, th, pal) {
		g.fillStyle = vertical(g, top, th, pal.body, pal.dark);
		g.beginPath();
		g.roundRect(x, top, w, th, 4);
		g.fill();
		g.fillStyle = css(pal.top);
		g.beginPath();
		g.roundRect(x + 1, top - 1.5, w - 2, 4, 2);
		g.fill();
		// Grietas cortas, siempre en el mismo lugar de la piedra.
		g.strokeStyle = css(pal.dark, 0.85);
		g.lineWidth = 1.5;
		g.lineCap = 'round';
		const cracks = Math.max(1, Math.floor(w / 46));
		for (let i = 0; i < cracks; i++) {
			const cx = x + ((i + 0.5) * w) / cracks;
			g.beginPath();
			g.moveTo(cx - 3, top + 3.5);
			g.lineTo(cx + 1, top + th * 0.55);
			g.lineTo(cx - 1, top + th - 2);
			g.stroke();
		}
	},

	ice(g, x, top, w, th, pal) {
		const ice = hslToRgb(rgbToHsl(pal.top)[0], 0.55, 0.82);
		const deep = hslToRgb(rgbToHsl(pal.body)[0], 0.6, 0.55);
		// Carámbanos colgando de abajo.
		g.fillStyle = css(deep, 0.85);
		const n = Math.max(2, Math.floor(w / 22));
		for (let i = 0; i < n; i++) {
			const cx = x + ((i + 0.5) * w) / n;
			const len = 4 + ((i * 5) % 4) * 1.5;
			g.beginPath();
			g.moveTo(cx - 3, top + th - 1);
			g.lineTo(cx + 3, top + th - 1);
			g.lineTo(cx, top + th + len);
			g.closePath();
			g.fill();
		}
		g.fillStyle = vertical(g, top, th, ice, deep);
		g.beginPath();
		g.roundRect(x, top, w, th, 5);
		g.fill();
		g.fillStyle = 'rgba(255,255,255,0.9)';
		g.beginPath();
		g.roundRect(x + 3, top + 1, w - 6, 2.5, 1.2);
		g.fill();
	},

	cloud(g, x, top, w, th, pal) {
		// Blanca por arriba y con sombra del color del paisaje por abajo, para que se lea también sobre nieve o cielo claro.
		const shade = mix([255, 255, 255], pal.body, 0.5);
		const puffs = Math.max(2, Math.floor(w / 20));
		const puff = (i: number) => ({
			cx: x + 8 + (i * (w - 16)) / Math.max(1, puffs - 1),
			cy: top + 4 - (i % 2) * 1.5,
			r: 6 + (i % 2)
		});
		for (const [color, dy] of [
			[css(shade), 2],
			['#ffffff', 0]
		] as const) {
			g.fillStyle = color;
			for (let i = 0; i < puffs; i++) {
				const p = puff(i);
				g.beginPath();
				g.arc(p.cx, p.cy + dy, p.r, 0, Math.PI * 2);
				g.fill();
			}
			g.beginPath();
			g.roundRect(x + 2, top + 2 + dy, w - 4, th - 5, th / 2);
			g.fill();
		}
	},

	crystal(g, x, top, w, th, pal) {
		const cut = Math.min(th * 0.7, w / 4);
		g.fillStyle = vertical(g, top, th, pal.top, pal.body);
		g.beginPath();
		g.moveTo(x, top + th / 2);
		g.lineTo(x + cut, top);
		g.lineTo(x + w - cut, top);
		g.lineTo(x + w, top + th / 2);
		g.lineTo(x + w - cut, top + th);
		g.lineTo(x + cut, top + th);
		g.closePath();
		g.fill();
		g.strokeStyle = css(pal.dark, 0.9);
		g.lineWidth = 1.5;
		g.stroke();
		// Facetas: diagonales claras y un destello.
		g.strokeStyle = 'rgba(255,255,255,0.55)';
		g.lineWidth = 1.2;
		const facets = Math.max(1, Math.floor(w / 34));
		for (let i = 1; i <= facets; i++) {
			const fx = x + (i * w) / (facets + 1);
			g.beginPath();
			g.moveTo(fx - 4, top + th - 1.5);
			g.lineTo(fx + 3, top + 1.5);
			g.stroke();
		}
		g.fillStyle = 'rgba(255,255,255,0.9)';
		g.beginPath();
		g.moveTo(x + cut + 2, top + 2.5);
		g.lineTo(x + cut + 6, top + 2.5);
		g.lineTo(x + cut + 4, top + th * 0.55);
		g.closePath();
		g.fill();
	},

	mushroom(g, x, top, w, th, pal) {
		const cap = hslToRgb(rgbToHsl(pal.top)[0], clamp(rgbToHsl(pal.top)[1], 0.55, 0.9), 0.5);
		const edge = hslToRgb(rgbToHsl(cap)[0], rgbToHsl(cap)[1], 0.34);
		// Laminillas claras abajo y sombrero encima.
		g.fillStyle = css(mix([255, 244, 220], pal.body, 0.2));
		g.beginPath();
		g.ellipse(x + w / 2, top + th, w / 2 - 1, 3, 0, 0, Math.PI * 2);
		g.fill();
		g.fillStyle = vertical(g, top - 1, th + 1, cap, edge);
		g.beginPath();
		g.ellipse(x + w / 2, top + th, w / 2, th + 0.5, 0, Math.PI, Math.PI * 2);
		g.closePath();
		g.fill();
		g.fillStyle = 'rgba(255,248,230,0.92)';
		const dots = Math.max(2, Math.floor(w / 24));
		for (let i = 0; i < dots; i++) {
			const t = (i + 0.5) / dots;
			const cx = x + 4 + t * (w - 8);
			g.beginPath();
			g.arc(cx, top + th * (0.55 + 0.18 * (i % 2)), 1.8 + (i % 3) * 0.4, 0, Math.PI * 2);
			g.fill();
		}
	}
};
