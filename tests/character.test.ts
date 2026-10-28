import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	buildStrip,
	chromaObjects,
	cutCell,
	cutObject,
	dropSpecks,
	flipHorizontal,
	gridCells,
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

describe('grilla de poses', () => {
	it('recorta cada pose en su celda aunque las aspas de la vecina la toquen', () => {
		const img = newRaster(300, 100);
		for (let i = 0; i < img.width * img.height; i++) img.data.set([90, 140, 70, 255], i * 4);
		const paint = (x: number, y: number, w: number, h: number) => {
			for (let j = 0; j < h; j++)
				for (let i = 0; i < w; i++)
					img.data.set([240, 60, 60, 255], ((y + j) * img.width + x + i) * 4);
		};
		paint(15, 40, 70, 50); // cuerpos
		paint(115, 40, 70, 50);
		paint(215, 40, 70, 50);
		paint(80, 20, 40, 4); // aspas que unen la 1.ª con la 2.ª
		paint(180, 20, 40, 4); // y la 2.ª con la 3.ª
		const bg: [number, number, number] = [90, 140, 70];
		const cells = gridCells(img, bg, 3, 1);
		expect(cells).toHaveLength(3);
		const frames = cells.map((c) => cutCell(img, c, [], bg)!);
		for (const f of frames) {
			expect(f).not.toBeNull();
			// Un cuerpo (70 px) más un tramo de aspas: nunca un cuerpo vecino entero (~170 px).
			expect(f.width).toBeLessThan(110);
		}
	});

	it('una celda vacía da null', () => {
		const img = newRaster(100, 50);
		for (let i = 0; i < img.width * img.height; i++) img.data.set([90, 140, 70, 255], i * 4);
		expect(cutCell(img, { x1: 0, y1: 0, x2: 50, y2: 50 }, [], [90, 140, 70])).toBeNull();
	});

	it('espejar cambia el lado', () => {
		const r = newRaster(4, 1);
		r.data.set([255, 0, 0, 255], 0);
		const f = flipHorizontal(r);
		expect(Array.from(f.data.slice(12, 16))).toEqual([255, 0, 0, 255]);
		expect(f.data[3]).toBe(0);
	});
});

describe('importar un personaje (.zip)', () => {
	/** Zip de un solo archivo, con el método (0 = sin compresión, 8 = deflate) y tamaño declarado a elección. */
	async function zipOf(
		name: string,
		payload: Uint8Array,
		opts: { method?: 0 | 8; declared?: number; crc?: number } = {}
	) {
		const { deflateRawSync } = await import('node:zlib');
		const { crc32 } = await import('../src/lib/character/zip');
		const method = opts.method ?? 0;
		const body = method === 8 ? new Uint8Array(deflateRawSync(payload)) : payload;
		const nameBytes = new TextEncoder().encode(name);
		const crc = opts.crc ?? crc32(payload);
		const usize = opts.declared ?? payload.length;
		const local = new DataView(new ArrayBuffer(30));
		local.setUint32(0, 0x04034b50, true);
		local.setUint16(8, method, true);
		local.setUint32(14, crc, true);
		local.setUint32(18, body.length, true);
		local.setUint32(22, usize, true);
		local.setUint16(26, nameBytes.length, true);
		const cd = new DataView(new ArrayBuffer(46));
		cd.setUint32(0, 0x02014b50, true);
		cd.setUint16(10, method, true);
		cd.setUint32(16, crc, true);
		cd.setUint32(20, body.length, true);
		cd.setUint32(24, usize, true);
		cd.setUint16(28, nameBytes.length, true);
		cd.setUint32(42, 0, true);
		const end = new DataView(new ArrayBuffer(22));
		end.setUint32(0, 0x06054b50, true);
		end.setUint16(8, 1, true);
		end.setUint16(10, 1, true);
		end.setUint32(12, 46 + nameBytes.length, true);
		end.setUint32(16, 30 + nameBytes.length + body.length, true);
		return Uint8Array.from([
			...new Uint8Array(local.buffer),
			...nameBytes,
			...body,
			...new Uint8Array(cd.buffer),
			...nameBytes,
			...new Uint8Array(end.buffer)
		]);
	}

	it('lee un zip sin compresión y uno con deflate (el de cualquier programa)', async () => {
		const { readZip } = await import('../src/lib/character/import');
		const text = new TextEncoder().encode('hola '.repeat(200));
		for (const method of [0, 8] as const) {
			const files = await readZip(await zipOf('dir/a.txt', text, { method }));
			expect(Array.from(files.keys())).toEqual(['a.txt']);
			expect(files.get('a.txt')).toEqual(text);
		}
	});

	it('rechaza lo que no es un zip, un CRC roto y una entrada que pesa más de lo declarado', async () => {
		const { readZip, ImportError } = await import('../src/lib/character/import');
		await expect(
			readZip(new TextEncoder().encode('esto no es un zip, para nada de nada'))
		).rejects.toBeInstanceOf(ImportError);
		const text = new TextEncoder().encode('x'.repeat(500));
		await expect(readZip(await zipOf('a.txt', text, { crc: 123 }))).rejects.toBeInstanceOf(
			ImportError
		);
		await expect(
			readZip(await zipOf('a.txt', text, { method: 8, declared: 10 }))
		).rejects.toBeInstanceOf(ImportError);
	});

	it('valida el manifiesto', async () => {
		const { parseManifest, ImportError } = await import('../src/lib/character/import');
		const sheet = (file: string, frames = 6) => ({
			file,
			frames,
			frameWidth: 200,
			frameHeight: 220
		});
		const ok = parseManifest({
			name: '  Michi  ',
			movement: 'walk',
			sheets: { stand: sheet('s.png', 2), move: sheet('m.png'), jump: sheet('../x/j.png', 5) }
		});
		expect(ok.name).toBe('Michi');
		expect(ok.jump?.file).toBe('j.png'); // sin rutas
		expect(() => parseManifest(null)).toThrow(ImportError);
		expect(() => parseManifest({ movement: 'swim', sheets: {} })).toThrow(ImportError);
		expect(() =>
			parseManifest({
				movement: 'fly',
				sheets: { stand: sheet('s.png'), move: { ...sheet('m.png'), frames: 999 } }
			})
		).toThrow(ImportError);
		expect(() =>
			parseManifest({ movement: 'fly', sheets: { stand: sheet('s.exe'), move: sheet('m.png') } })
		).toThrow(ImportError);
	});

	it('un zip exportado por la app se puede volver a leer', async () => {
		const { readZip } = await import('../src/lib/character/import');
		const { zipStore } = await import('../src/lib/character/zip');
		const zip = zipStore([
			{ name: 'a-move.png', data: new Uint8Array([137, 80, 78, 71, 1, 2, 3, 4, 5]) },
			{ name: 'character.json', data: new TextEncoder().encode('{}') }
		]);
		const files = await readZip(zip);
		expect([...files.keys()].sort()).toEqual(['a-move.png', 'character.json']);
	});
});

describe('limpiar motas', () => {
	it('borra un grupo chico desconectado y deja la figura', () => {
		const r = newRaster(100, 100);
		const paint = (x: number, y: number, w: number, h: number) => {
			for (let j = 0; j < h; j++)
				for (let i = 0; i < w; i++)
					r.data.set([200, 100, 50, 255], ((y + j) * r.width + x + i) * 4);
		};
		paint(10, 10, 60, 60); // figura (3600 px)
		paint(85, 85, 3, 3); // mota (9 px, menos de 14)
		paint(72, 30, 6, 6); // pieza chica pero > 0,4 % (36 px): se queda
		dropSpecks(r);
		expect(r.data[(86 * 100 + 86) * 4 + 3]).toBe(0);
		expect(r.data[(40 * 100 + 40) * 4 + 3]).toBe(255);
		expect(r.data[(32 * 100 + 74) * 4 + 3]).toBe(255);
	});
});
