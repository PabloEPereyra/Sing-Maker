import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	buildStrip,
	chromaObjects,
	cutObject,
	estimateBackground,
	newRaster,
	pickObjects,
	type Raster
} from '../src/lib/character/process';
import { parseSamText, type SamObject } from '../src/lib/character/sam';

/** Imagen verde con un rectángulo de color y el SamObject que lo recorta. */
function blob(
	canvas: Raster,
	x: number,
	y: number,
	w: number,
	h: number,
	color: [number, number, number]
): SamObject {
	for (let j = 0; j < h; j++)
		for (let i = 0; i < w; i++) {
			const o = ((y + j) * canvas.width + x + i) * 4;
			canvas.data.set([...color, 255], o);
		}
	return {
		id: String(x),
		box: { x1: x, y1: y, x2: x + w - 1, y2: y + h - 1 },
		mask: { w, h, data: new Uint8Array(w * h).fill(1) }
	};
}

function sheet(): { img: Raster; objects: SamObject[] } {
	const img = newRaster(300, 100);
	for (let i = 0; i < img.width * img.height; i++) img.data.set([0, 177, 64, 255], i * 4);
	const objects = [
		blob(img, 10, 20, 40, 60, [250, 250, 250]),
		blob(img, 110, 10, 50, 80, [250, 250, 250]),
		blob(img, 220, 30, 40, 50, [250, 250, 250])
	];
	return { img, objects };
}

describe('SAM: lectura de la respuesta', () => {
	const text = readFileSync('tests/fixtures/sam-rabbits.txt', 'utf8');

	it('separa una máscara por pose, con cajas y tamaños consistentes', () => {
		const objs = parseSamText(text);
		expect(objs).toHaveLength(6);
		for (const o of objs) {
			expect(o.mask.w).toBe(o.box.x2 - o.box.x1 + 1);
			expect(o.mask.h).toBe(o.box.y2 - o.box.y1 + 1);
			const on = o.mask.data.reduce((a, b) => a + b, 0);
			expect(on / o.mask.data.length).toBeGreaterThan(0.3);
			expect(on / o.mask.data.length).toBeLessThan(0.9);
		}
	});

	it('un texto vacío o dañado no rompe nada', () => {
		expect(parseSamText('')).toEqual([]);
		expect(
			parseSamText('<0f>0<|box;x1=1;y1=1;x2=2;y2=2;w=9;h=9|><|mask;x=0;y=0;data=2,2,!zzz|>')
		).toEqual([]);
	});
});

describe('creador de personajes: procesado', () => {
	it('elige las poses de izquierda a derecha y descarta restos chicos', () => {
		const { objects } = sheet();
		const speck: SamObject = {
			id: 'speck',
			box: { x1: 5, y1: 5, x2: 8, y2: 8 },
			mask: { w: 4, h: 4, data: new Uint8Array(16).fill(1) }
		};
		const picked = pickObjects([objects[2], speck, objects[0], objects[1]], 2, 8);
		expect(picked.map((o) => o.box.x1)).toEqual([10, 110, 220]);
		expect(() => pickObjects([objects[0]], 3, 8)).toThrow();
	});

	it('recorta con transparencia y le saca el verde al borde', () => {
		const { img, objects } = sheet();
		// Un píxel del borde con reflejo verde.
		const o = objects[0];
		const edge = (o.box.y1 * img.width + o.box.x1) * 4;
		img.data.set([240, 255, 240, 255], edge);
		const cut = cutObject(img, o);
		expect(cut.width).toBe(40);
		expect(cut.data[3]).toBeLessThan(255); // esquina suavizada
		const mid = ((30 * 40 + 20) * 4) as number;
		expect(cut.data[mid + 3]).toBe(255);
		expect(cut.data[mid + 1]).toBe(250); // el interior no se toca
	});

	it('rescata lo que SAM deja afuera (una gorra pegada) sin traer fondo ni otras poses', () => {
		const img = newRaster(200, 120);
		for (let i = 0; i < img.width * img.height; i++) img.data.set([90, 140, 70, 255], i * 4);
		// Cuerpo blanco (lo único que SAM marca) con una gorra azul apoyada arriba.
		const body = blob(img, 60, 50, 50, 60, [250, 250, 250]);
		for (let y = 36; y < 50; y++)
			for (let x = 65; x < 105; x++) img.data.set([30, 80, 200, 255], (y * img.width + x) * 4);
		// Otra figura lejos: no debe entrar.
		blob(img, 150, 50, 30, 60, [250, 250, 250]);
		const bg = estimateBackground(img);
		expect(bg).toEqual([90, 140, 70]);
		const withSeeds = cutObject(img, body);
		const grown = cutObject(img, body, bg);
		const alphaAt = (r: Raster, x: number, y: number, x0: number, y0: number) =>
			r.data[((y - y0) * r.width + (x - x0)) * 4 + 3];
		// Sin el color de fondo la gorra queda transparente (el bug); con él se conserva.
		expect(grown.width).toBeGreaterThan(withSeeds.width);
		expect(alphaAt(grown, 85, 42, 60 - Math.round(60 * 0.3), 50 - Math.round(60 * 0.3))).toBe(255);
		// El fondo verde alrededor sigue transparente.
		expect(alphaAt(grown, 62, 40, 60 - Math.round(60 * 0.3), 50 - Math.round(60 * 0.3))).toBe(0);
	});

	it('arma una tira: mismo factor de escala, pies abajo y cuadros del mismo ancho', () => {
		const { img, objects } = sheet();
		const frames = objects.map((o) => cutObject(img, o));
		const strip = buildStrip(frames, 'feet');
		expect(strip.frames).toBe(3);
		expect(strip.raster.width).toBe(strip.frameWidth * 3);
		expect(strip.raster.height).toBe(strip.frameHeight);
		// El cuadro más alto (80 px) ocupa más alto útil que el más bajo (50 px): se escalaron igual.
		const heightOf = (f: number) => {
			let top = strip.frameHeight;
			for (let y = 0; y < strip.frameHeight; y++)
				for (let x = 0; x < strip.frameWidth; x++)
					if (strip.raster.data[(y * strip.raster.width + f * strip.frameWidth + x) * 4 + 3] > 40)
						top = Math.min(top, y);
			return strip.frameHeight - top;
		};
		expect(heightOf(1) / heightOf(2)).toBeCloseTo(80 / 50, 0);
		// Todos apoyados en el borde inferior.
		for (let f = 0; f < 3; f++) {
			const bottomRow = strip.frameHeight - 2;
			let any = false;
			for (let x = 0; x < strip.frameWidth; x++)
				if (
					strip.raster.data[(bottomRow * strip.raster.width + f * strip.frameWidth + x) * 4 + 3] >
					40
				)
					any = true;
			expect(any).toBe(true);
		}
	});

	it('falla con una pose vacía', () => {
		expect(() => buildStrip([newRaster(10, 10)], 'feet')).toThrow();
	});
});

describe('exportar: zip', () => {
	it('arma un zip válido (cabeceras, CRC y directorio central)', async () => {
		const { crc32, zipStore } = await import('../src/lib/character/zip');
		expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
		const zip = zipStore([
			{ name: 'a.png', data: new Uint8Array([1, 2, 3]) },
			{ name: 'b.json', data: new TextEncoder().encode('{}') }
		]);
		const view = new DataView(zip.buffer);
		expect(view.getUint32(0, true)).toBe(0x04034b50);
		expect(view.getUint32(zip.length - 22, true)).toBe(0x06054b50);
		expect(view.getUint16(zip.length - 22 + 10, true)).toBe(2);
	});

	it('el nombre de archivo sale limpio', async () => {
		const { slug } = await import('../src/lib/character/export');
		expect(slug('Gatito con Gorra Azul!')).toBe('gatito-con-gorra-azul');
		expect(slug('Ñandú ✨')).toBe('nandu');
		expect(slug('***')).toBe('personaje');
	});
});

describe('sustantivos para SAM', () => {
	it('de la frase larga a la palabra simple', async () => {
		const { nounVariants } = await import('../src/lib/character/create');
		expect(nounVariants('Cat with blue cap')).toEqual(['cat with blue cap', 'cat']);
		expect(nounVariants('orange fox')).toEqual(['orange fox', 'fox']);
		expect(nounVariants('rabbit')).toEqual(['rabbit']);
	});
});

describe('separar figuras por color (plan B sin SAM)', () => {
	it('junta las piezas cercanas (aspas) y separa las figuras lejanas', () => {
		const img = newRaster(300, 120);
		for (let i = 0; i < img.width * img.height; i++) img.data.set([90, 140, 70, 255], i * 4);
		const fill = (x: number, y: number, w: number, h: number) => {
			for (let j = 0; j < h; j++)
				for (let i = 0; i < w; i++)
					img.data.set([240, 60, 60, 255], ((y + j) * img.width + x + i) * 4);
		};
		fill(30, 50, 50, 50); // cuerpo
		fill(20, 30, 70, 6); // aspas, a 14 px del cuerpo
		fill(200, 50, 50, 50); // otra pose, lejos
		const objects = chromaObjects(img, [90, 140, 70]);
		expect(objects).toHaveLength(2);
		const first = objects.find((o) => o.box.x1 < 100)!;
		expect(first.box.y1).toBe(30); // las aspas quedaron con el cuerpo
		expect(first.box.x2 - first.box.x1 + 1).toBe(70);
	});

	it('una imagen lisa no tiene figuras', () => {
		const img = newRaster(100, 100);
		for (let i = 0; i < img.width * img.height; i++) img.data.set([90, 140, 70, 255], i * 4);
		expect(chromaObjects(img, [90, 140, 70])).toEqual([]);
	});
});

describe('cortar una tira por columnas (poses que se tocan)', () => {
	it('separa 3 poses unidas por un puente de aspas en el valle de menos píxeles', async () => {
		const { splitStripByColumns } = await import('../src/lib/character/process');
		const img = newRaster(300, 100);
		for (let i = 0; i < img.width * img.height; i++) img.data.set([90, 140, 70, 255], i * 4);
		const paint = (x: number, y: number, w: number, h: number) => {
			for (let j = 0; j < h; j++)
				for (let i = 0; i < w; i++)
					img.data.set([240, 60, 60, 255], ((y + j) * img.width + x + i) * 4);
		};
		paint(15, 40, 70, 50);
		paint(115, 40, 70, 50);
		paint(215, 40, 70, 50);
		paint(80, 20, 40, 4); // aspas: unen la 1.ª con la 2.ª
		paint(180, 20, 40, 4); // y la 2.ª con la 3.ª
		const cells = splitStripByColumns(img, [90, 140, 70], 3);
		expect(cells).toHaveLength(3);
		expect(cells.map((c) => c.box.y2 - c.box.y1 + 1)).toEqual(
			[71, 71, 71].map((v) => v - 21 + 21 - 1)
		);
	});
});
