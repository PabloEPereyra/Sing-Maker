// Procesado de imágenes del creador de personajes, sin canvas ni DOM (trabaja sobre píxeles RGBA)
// para poder probarlo con vitest. Pasos: SAM da una máscara por pose -> se recorta cada pose con borde
// suave y sin el tinte del fondo verde -> se escalan todas igual y se alinean en una tira de cuadros iguales.
import type { SamObject } from './sam';
import { CharacterError } from './spec';

export interface Raster {
	data: Uint8ClampedArray;
	width: number;
	height: number;
}

export function newRaster(width: number, height: number): Raster {
	return { data: new Uint8ClampedArray(width * height * 4), width, height };
}

/** Tamaño de cuerpo al que se normalizan todas las tiras: raíz del área de la silueta (px de salida). */
export const BODY_SIDE = 125;
/** Alto máximo de un cuadro de salida. */
export const MAX_FRAME_H = 300;

// ---------- recorte con máscara ----------

/** Erosiona una máscara binaria `n` píxeles (los bordes de la imagen cuentan como vacío). */
function erode(mask: Uint8Array, w: number, h: number, n: number): Uint8Array {
	let cur = mask;
	for (let k = 0; k < n; k++) {
		const next = new Uint8Array(w * h);
		for (let y = 0; y < h; y++)
			for (let x = 0; x < w; x++) {
				const i = y * w + x;
				if (
					cur[i] &&
					x > 0 &&
					y > 0 &&
					x < w - 1 &&
					y < h - 1 &&
					cur[i - 1] &&
					cur[i + 1] &&
					cur[i - w] &&
					cur[i + w]
				)
					next[i] = 1;
			}
		cur = next;
	}
	return cur;
}

export type Rgb = [number, number, number];

/** Color del fondo liso de una imagen: mediana por canal de un marco de 4 px alrededor. */
export function estimateBackground(src: Raster): Rgb {
	const ring: number[][] = [[], [], []];
	for (let y = 0; y < src.height; y++)
		for (let x = 0; x < src.width; x++) {
			if (x >= 4 && y >= 4 && x < src.width - 4 && y < src.height - 4) {
				x = src.width - 4 - 1; // salta el interior de la fila
				continue;
			}
			const i = (y * src.width + x) * 4;
			for (let c = 0; c < 3; c++) ring[c].push(src.data[i + c]);
		}
	const med = (v: number[]) => v.sort((a, b) => a - b)[v.length >> 1] ?? 0;
	return [med(ring[0]), med(ring[1]), med(ring[2])];
}

/** Distancia de color (euclídea en RGB) por encima de la cual un píxel ya no es el fondo. */
const BACKGROUND_DISTANCE = 60;
/** Cuánto se agranda la caja de SAM para buscar lo que quedó pegado afuera (accesorios), en fracción del lado mayor. */
const GROW_FRACTION = 0.3;

/**
 * Recorta un objeto de SAM de la imagen. SAM suele dejar afuera los accesorios (una gorra, una bufanda,
 * un moño): si se conoce el color del fondo liso (`background`), la máscara crece por color hacia
 * todo lo que está pegado al personaje y no es fondo. Después el borde se achica 1 px (los recortes
 * traen un pelo del fondo), se suaviza (promedio 3×3) y en la franja del borde se le saca al verde
 * lo que sobra, que es el reflejo del fondo. El tamaño del resultado es el de la caja agrandada.
 */
export function cutObject(src: Raster, obj: SamObject, background?: Rgb): Raster {
	const grow = background ? Math.round(Math.max(obj.mask.w, obj.mask.h) * GROW_FRACTION) : 0;
	const x0 = Math.max(0, obj.box.x1 - grow);
	const y0 = Math.max(0, obj.box.y1 - grow);
	const w = Math.min(src.width, obj.box.x2 + 1 + grow) - x0;
	const h = Math.min(src.height, obj.box.y2 + 1 + grow) - y0;
	const out = newRaster(w, h);

	// Máscara de SAM puesta en la región agrandada.
	const mask = new Uint8Array(w * h);
	const ox = obj.box.x1 - x0;
	const oy = obj.box.y1 - y0;
	for (let y = 0; y < obj.mask.h; y++)
		for (let x = 0; x < obj.mask.w; x++)
			if (obj.mask.data[y * obj.mask.w + x]) mask[(oy + y) * w + ox + x] = 1;

	if (background) {
		const limit = BACKGROUND_DISTANCE * BACKGROUND_DISTANCE;
		const isForeground = (i: number) => {
			const si = ((y0 + Math.floor(i / w)) * src.width + x0 + (i % w)) * 4;
			const dr = src.data[si] - background[0];
			const dg = src.data[si + 1] - background[1];
			const db = src.data[si + 2] - background[2];
			return dr * dr + dg * dg + db * db > limit;
		};
		const queue: number[] = [];
		for (let i = 0; i < mask.length; i++) if (mask[i]) queue.push(i);
		for (let head = 0; head < queue.length; head++) {
			const i = queue[head];
			const x = i % w;
			const y = (i - x) / w;
			for (const j of [
				x > 0 ? i - 1 : -1,
				x < w - 1 ? i + 1 : -1,
				y > 0 ? i - w : -1,
				y < h - 1 ? i + w : -1
			]) {
				if (j < 0 || mask[j] || !isForeground(j)) continue;
				mask[j] = 1;
				queue.push(j);
			}
		}
	}

	const inner = erode(mask, w, h, 1);
	const core = erode(inner, w, h, 2);
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			// Cobertura: promedio de 3×3 de la máscara ya erosionada.
			let sum = 0;
			for (let dy = -1; dy <= 1; dy++)
				for (let dx = -1; dx <= 1; dx++) {
					const nx = x + dx;
					const ny = y + dy;
					if (nx >= 0 && ny >= 0 && nx < w && ny < h) sum += inner[ny * w + nx];
				}
			const alpha = Math.round((sum / 9) * 255);
			if (alpha === 0) continue;
			const si = ((y0 + y) * src.width + x0 + x) * 4;
			const oi = (y * w + x) * 4;
			const r = src.data[si];
			let g = src.data[si + 1];
			const b = src.data[si + 2];
			if (!core[y * w + x]) g = Math.min(g, Math.max(r, b));
			out.data[oi] = r;
			out.data[oi + 1] = g;
			out.data[oi + 2] = b;
			out.data[oi + 3] = alpha;
		}
	return out;
}

/**
 * Plan B cuando SAM no reconoce el sustantivo: en una imagen de fondo liso (la que genera Muse Image sobre
 * verde), cada figura es un grupo de píxeles que no son fondo. Las piezas cercanas (las aspas de un
 * helicóptero, una capa, un moño) se juntan con la figura; las lejanas son otra figura (otra pose).
 */
export function chromaObjects(src: Raster, background: Rgb, joinRadius = 10): SamObject[] {
	const { width: w, height: h } = src;
	const limit = BACKGROUND_DISTANCE * BACKGROUND_DISTANCE;
	const fg = new Uint8Array(w * h);
	for (let i = 0; i < w * h; i++) {
		const dr = src.data[i * 4] - background[0];
		const dg = src.data[i * 4 + 1] - background[1];
		const db = src.data[i * 4 + 2] - background[2];
		if (dr * dr + dg * dg + db * db > limit) fg[i] = 1;
	}
	// Dilatación separable (máximo en una ventana) para unir las piezas cercanas.
	const spread = (input: Uint8Array, horizontal: boolean): Uint8Array => {
		const out = new Uint8Array(w * h);
		for (let y = 0; y < h; y++)
			for (let x = 0; x < w; x++) {
				if (!input[y * w + x]) continue;
				for (let d = -joinRadius; d <= joinRadius; d++) {
					const nx = horizontal ? x + d : x;
					const ny = horizontal ? y : y + d;
					if (nx >= 0 && ny >= 0 && nx < w && ny < h) out[ny * w + nx] = 1;
				}
			}
		return out;
	};
	const near = spread(spread(fg, true), false);
	// Grupos conexos de la máscara dilatada.
	const label = new Int32Array(w * h).fill(-1);
	const groups: { x1: number; y1: number; x2: number; y2: number; pixels: number[] }[] = [];
	for (let start = 0; start < w * h; start++) {
		if (!near[start] || label[start] >= 0) continue;
		const id = groups.length;
		const g = { x1: w, y1: h, x2: -1, y2: -1, pixels: [] as number[] };
		const stack = [start];
		label[start] = id;
		while (stack.length) {
			const i = stack.pop()!;
			const x = i % w;
			const y = (i - x) / w;
			if (fg[i]) {
				g.pixels.push(i);
				if (x < g.x1) g.x1 = x;
				if (x > g.x2) g.x2 = x;
				if (y < g.y1) g.y1 = y;
				if (y > g.y2) g.y2 = y;
			}
			for (const j of [
				x > 0 ? i - 1 : -1,
				x < w - 1 ? i + 1 : -1,
				y > 0 ? i - w : -1,
				y < h - 1 ? i + w : -1
			]) {
				if (j >= 0 && near[j] && label[j] < 0) {
					label[j] = id;
					stack.push(j);
				}
			}
		}
		groups.push(g);
	}
	const minPixels = Math.max(200, Math.round(w * h * 0.002));
	return groups
		.filter((g) => g.pixels.length >= minPixels)
		.map((g, n) => {
			const mw = g.x2 - g.x1 + 1;
			const mh = g.y2 - g.y1 + 1;
			const data = new Uint8Array(mw * mh);
			for (const i of g.pixels) data[(Math.floor(i / w) - g.y1) * mw + (i % w) - g.x1] = 1;
			return {
				id: `c${n}`,
				box: { x1: g.x1, y1: g.y1, x2: g.x2, y2: g.y2 },
				mask: { w: mw, h: mh, data }
			};
		});
}

/**
 * Plan C para una tira de `n` poses en fila: cuando las piezas de poses vecinas se tocan (aspas, capas
 * largas) no hay forma de separarlas por conexión. Se corta en `n` celdas parejas, y cada corte se
 * acomoda en la columna con menos píxeles de figura cerca del punto esperado.
 */
export function splitStripByColumns(src: Raster, background: Rgb, n: number): SamObject[] {
	const { width: w, height: h } = src;
	const limit = BACKGROUND_DISTANCE * BACKGROUND_DISTANCE;
	const fg = new Uint8Array(w * h);
	const mass = new Int32Array(w);
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const i = (y * w + x) * 4;
			const dr = src.data[i] - background[0];
			const dg = src.data[i + 1] - background[1];
			const db = src.data[i + 2] - background[2];
			if (dr * dr + dg * dg + db * db > limit) {
				fg[y * w + x] = 1;
				mass[x]++;
			}
		}
	const cell = w / n;
	const cuts = [0];
	for (let k = 1; k < n; k++) {
		const expected = Math.round(k * cell);
		const from = Math.max(cuts[k - 1] + 1, Math.round(expected - cell * 0.2));
		const to = Math.min(w - 1, Math.round(expected + cell * 0.2));
		let best = expected;
		for (let x = from; x <= to; x++) if (mass[x] < mass[best] || best < from) best = x;
		cuts.push(best);
	}
	cuts.push(w);
	const objects: SamObject[] = [];
	for (let k = 0; k < n; k++) {
		let x1 = w;
		let x2 = -1;
		let y1 = h;
		let y2 = -1;
		for (let y = 0; y < h; y++)
			for (let x = cuts[k]; x < cuts[k + 1]; x++)
				if (fg[y * w + x]) {
					if (x < x1) x1 = x;
					if (x > x2) x2 = x;
					if (y < y1) y1 = y;
					if (y > y2) y2 = y;
				}
		if (x2 < 0) continue;
		const mw = x2 - x1 + 1;
		const mh = y2 - y1 + 1;
		const data = new Uint8Array(mw * mh);
		for (let y = y1; y <= y2; y++)
			for (let x = x1; x <= x2; x++) data[(y - y1) * mw + x - x1] = fg[y * w + x];
		objects.push({ id: `s${k}`, box: { x1, y1, x2, y2 }, mask: { w: mw, h: mh, data } });
	}
	return objects;
}

/**
 * Elige las poses de una tira: descarta restos chicos (menos de un cuarto de la mayor), y si hay más de
 * `max` se queda con las más grandes. Devuelve de izquierda a derecha.
 */
export function pickObjects(objects: SamObject[], min: number, max: number): SamObject[] {
	const area = (o: SamObject) => o.mask.data.reduce((a, b) => a + b, 0);
	const sized = objects.map((o) => ({ o, a: area(o) }));
	const biggest = Math.max(0, ...sized.map((s) => s.a));
	const kept = sized
		.filter((s) => s.a >= biggest * 0.25)
		.sort((p, q) => q.a - p.a)
		.slice(0, max)
		.sort((p, q) => p.o.box.x1 - q.o.box.x1)
		.map((s) => s.o);
	if (kept.length < min)
		throw new CharacterError(
			'fewPoses',
			`Only ${kept.length} poses were found; at least ${min} are needed.`
		);
	return kept;
}

// ---------- tira de cuadros ----------

function alphaStats(r: Raster): {
	area: number;
	cx: number;
	cy: number;
	box: [number, number, number, number];
} {
	let area = 0;
	let sx = 0;
	let sy = 0;
	let x0 = r.width;
	let y0 = r.height;
	let x1 = -1;
	let y1 = -1;
	for (let y = 0; y < r.height; y++)
		for (let x = 0; x < r.width; x++) {
			const a = r.data[(y * r.width + x) * 4 + 3];
			if (a < 16) continue;
			area += a / 255;
			sx += (a / 255) * x;
			sy += (a / 255) * y;
			if (x < x0) x0 = x;
			if (x > x1) x1 = x;
			if (y < y0) y0 = y;
			if (y > y1) y1 = y;
		}
	if (!area) return { area: 0, cx: 0, cy: 0, box: [0, 0, 0, 0] };
	return { area, cx: sx / area, cy: sy / area, box: [x0, y0, x1 + 1, y1 + 1] };
}

/** Recorta un raster a la caja dada. */
function crop(r: Raster, [x0, y0, x1, y1]: [number, number, number, number]): Raster {
	const out = newRaster(x1 - x0, y1 - y0);
	for (let y = 0; y < out.height; y++) {
		const from = ((y0 + y) * r.width + x0) * 4;
		out.data.set(r.data.subarray(from, from + out.width * 4), y * out.width * 4);
	}
	return out;
}

/** Escala con interpolación bilineal sobre alfa premultiplicado (sin halos oscuros en el borde). */
export function resize(r: Raster, w: number, h: number): Raster {
	const out = newRaster(Math.max(1, w), Math.max(1, h));
	const kx = r.width / out.width;
	const ky = r.height / out.height;
	const px = (x: number, y: number, c: number) => {
		const cx = Math.min(r.width - 1, Math.max(0, x));
		const cy = Math.min(r.height - 1, Math.max(0, y));
		const i = (cy * r.width + cx) * 4;
		return c === 3 ? r.data[i + 3] : (r.data[i + c] * r.data[i + 3]) / 255;
	};
	for (let y = 0; y < out.height; y++)
		for (let x = 0; x < out.width; x++) {
			const fx = (x + 0.5) * kx - 0.5;
			const fy = (y + 0.5) * ky - 0.5;
			const x0 = Math.floor(fx);
			const y0 = Math.floor(fy);
			const tx = fx - x0;
			const ty = fy - y0;
			const mix = (c: number) =>
				px(x0, y0, c) * (1 - tx) * (1 - ty) +
				px(x0 + 1, y0, c) * tx * (1 - ty) +
				px(x0, y0 + 1, c) * (1 - tx) * ty +
				px(x0 + 1, y0 + 1, c) * tx * ty;
			const a = mix(3);
			const o = (y * out.width + x) * 4;
			if (a > 0.5) {
				out.data[o] = (mix(0) * 255) / a;
				out.data[o + 1] = (mix(1) * 255) / a;
				out.data[o + 2] = (mix(2) * 255) / a;
			}
			out.data[o + 3] = a;
		}
	return out;
}

export interface Strip {
	raster: Raster;
	frames: number;
	frameWidth: number;
	frameHeight: number;
}

/**
 * Arma una tira de cuadros iguales. Todos los cuadros se escalan por el mismo factor (el que lleva el
 * tamaño medio del cuerpo a `BODY_SIDE`), así el personaje mide lo mismo en todas las tiras.
 *   'feet'   -> centrado por la masa en horizontal y apoyado en el borde inferior (caminante).
 *   'center' -> centrado por la masa en ambos ejes (volador: las alas suben y bajan sin que "salte").
 */
export function buildStrip(frames: Raster[], anchor: 'feet' | 'center'): Strip {
	const stats = frames.map(alphaStats);
	if (stats.some((s) => s.area === 0))
		throw new CharacterError('emptyPose', 'A pose came out empty.');
	const mean = stats.reduce((a, s) => a + Math.sqrt(s.area), 0) / stats.length;
	let k = BODY_SIDE / mean;
	// Un cuadro nunca pasa de MAX_FRAME_H (poses muy estiradas).
	const tallest = Math.max(...stats.map((s) => s.box[3] - s.box[1]));
	k = Math.min(k, MAX_FRAME_H / tallest);

	const placed = frames.map((f, i) => {
		const s = stats[i];
		const c = crop(f, s.box);
		const cx = s.cx - s.box[0];
		const cy = s.cy - s.box[1];
		const scaled = resize(c, Math.round(c.width * k), Math.round(c.height * k));
		return { r: scaled, cx: cx * k, cy: cy * k };
	});
	const halfW = Math.ceil(Math.max(...placed.map((p) => Math.max(p.cx, p.r.width - p.cx)))) + 2;
	const frameWidth = halfW * 2;
	let frameHeight: number;
	let above: number; // píxeles de la celda por encima del punto de anclaje
	if (anchor === 'feet') {
		frameHeight = Math.max(...placed.map((p) => p.r.height)) + 2;
		above = frameHeight;
	} else {
		const up = Math.ceil(Math.max(...placed.map((p) => p.cy)));
		const down = Math.ceil(Math.max(...placed.map((p) => p.r.height - p.cy)));
		frameHeight = Math.max(up, down) * 2 + 4;
		above = frameHeight / 2;
	}
	const raster = newRaster(frameWidth * placed.length, frameHeight);
	placed.forEach((p, i) => {
		const ox = Math.round(i * frameWidth + halfW - p.cx);
		const oy = Math.round(anchor === 'feet' ? frameHeight - p.r.height : above - p.cy);
		for (let y = 0; y < p.r.height; y++)
			for (let x = 0; x < p.r.width; x++) {
				const dx = ox + x;
				const dy = oy + y;
				if (dx < 0 || dy < 0 || dx >= raster.width || dy >= raster.height) continue;
				const from = (y * p.r.width + x) * 4;
				if (p.r.data[from + 3] === 0) continue;
				raster.data.set(p.r.data.subarray(from, from + 4), (dy * raster.width + dx) * 4);
			}
	});
	return { raster, frames: placed.length, frameWidth, frameHeight };
}

/** Pone un raster con transparencia sobre un color liso (para usar de referencia de edición). */
export function compositeOnColor(r: Raster, rgb: [number, number, number]): Raster {
	const out = newRaster(r.width, r.height);
	for (let i = 0; i < r.width * r.height; i++) {
		const a = r.data[i * 4 + 3] / 255;
		for (let c = 0; c < 3; c++)
			out.data[i * 4 + c] = Math.round(r.data[i * 4 + c] * a + rgb[c] * (1 - a));
		out.data[i * 4 + 3] = 255;
	}
	return out;
}

/** Recorta un raster con margen alrededor de lo opaco (y lo deja como está si está vacío). */
export function trimToContent(r: Raster, margin = 0): Raster {
	const s = alphaStats(r);
	if (!s.area) return r;
	const [x0, y0, x1, y1] = s.box;
	return crop(r, [
		Math.max(0, x0 - margin),
		Math.max(0, y0 - margin),
		Math.min(r.width, x1 + margin),
		Math.min(r.height, y1 + margin)
	]);
}
