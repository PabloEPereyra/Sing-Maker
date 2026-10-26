// Prepara hojas de sprites PNG con transparencia -> tira de cuadros iguales en static/.
// Se respeta el alfa del archivo; solo se limpia el tinte magenta que traen algunos píxeles
// semitransparentes del borde (el color oculto bajo el alfa es magenta).
//
// Dos formas de separar los cuadros:
//   split: 'grid'  -> N columnas del mismo ancho (cuando la IA dejó los cuadros parejos).
//   split: 'auto'  -> cada figura es un grupo de píxeles conectados; se toman las N más grandes
//                     (de izquierda a derecha) y los pedacitos sueltos se suman a la más cercana.
//                     Sirve cuando las alas de un cuadro invaden el ancho del vecino.
// En 'auto' cada cuadro se alinea por un ancla, para que el cuerpo no "salte" entre cuadros:
//   anchor: 'mass' -> centro de masa;  anchor: 'beak' -> pico naranja (mitad superior de la figura).
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const SHEETS = [
	{
		src: 'assets/sky/character-sheet.png',
		out: 'static/themes/sky/character',
		frames: 4,
		height: 220,
		split: 'grid'
	},
	{
		src: 'assets/sky/character2-sheet.png',
		out: 'static/themes/sky/character2',
		frames: 6,
		height: 220,
		split: 'auto',
		anchor: 'beak'
	},
	{
		src: 'assets/collectibles/notes-sheet.png',
		out: 'static/collectibles/notes',
		frames: 4,
		height: 128,
		split: 'grid'
	}
];

const ALPHA_MIN = 20;

async function loadClean(src) {
	const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	for (let i = 0; i < data.length; i += 4) {
		const a = data[i + 3];
		if (a > 0 && a < 255) {
			const r = data[i],
				g = data[i + 1],
				b = data[i + 2];
			const m = Math.max(0, Math.min(r, b) - g);
			data[i] = r - m * 0.8;
			data[i + 2] = b - m * 0.8;
		}
	}
	return { data, width: info.width, height: info.height };
}

/** Cuadros por columnas iguales, recortados al contorno común. */
function gridFrames(img, n) {
	const { data, width, height } = img;
	const fw = Math.floor(width / n);
	let minX = fw,
		minY = height,
		maxX = 0,
		maxY = 0;
	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++)
			if (data[(y * width + x) * 4 + 3] > ALPHA_MIN) {
				const fx = x % fw;
				minX = Math.min(minX, fx);
				maxX = Math.max(maxX, fx);
				minY = Math.min(minY, y);
				maxY = Math.max(maxY, y);
			}
	const cw = maxX - minX + 1,
		ch = maxY - minY + 1;
	return Array.from({ length: n }, (_, f) => ({
		left: f * fw + minX,
		top: minY,
		width: cw,
		height: ch,
		mask: null,
		cx: cw / 2,
		cy: ch / 2
	}));
}

/** Componentes conectados (sobre una máscara reducida 1/4 para que sea rápido). */
function autoFrames(img, n, anchor = 'mass') {
	const { data, width: W, height: H } = img;
	const S = 4,
		w = Math.ceil(W / S),
		h = Math.ceil(H / S);
	const mask = new Uint8Array(w * h);
	for (let y = 0; y < H; y++)
		for (let x = 0; x < W; x++)
			if (data[(y * W + x) * 4 + 3] > ALPHA_MIN) mask[((y / S) | 0) * w + ((x / S) | 0)] = 1;
	const label = new Int32Array(w * h).fill(-1);
	const comps = [];
	for (let i = 0; i < w * h; i++) {
		if (!mask[i] || label[i] >= 0) continue;
		const c = { id: comps.length, n: 0, sx: 0, sy: 0, x0: w, y0: h, x1: 0, y1: 0 };
		const stack = [i];
		label[i] = c.id;
		while (stack.length) {
			const j = stack.pop();
			const x = j % w,
				y = (j / w) | 0;
			c.n++;
			c.sx += x;
			c.sy += y;
			c.x0 = Math.min(c.x0, x);
			c.x1 = Math.max(c.x1, x);
			c.y0 = Math.min(c.y0, y);
			c.y1 = Math.max(c.y1, y);
			for (const [dx, dy] of [
				[1, 0],
				[-1, 0],
				[0, 1],
				[0, -1]
			]) {
				const nx = x + dx,
					ny = y + dy;
				if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
				const k = ny * w + nx;
				if (mask[k] && label[k] < 0) {
					label[k] = c.id;
					stack.push(k);
				}
			}
		}
		comps.push(c);
	}
	const main = [...comps]
		.sort((a, b) => b.n - a.n)
		.slice(0, n)
		.sort((a, b) => a.sx / a.n - b.sx / b.n);
	if (main.length < n) throw new Error(`Se esperaban ${n} figuras y hay ${main.length}`);
	// Cada componente (también los pedacitos) se asigna a la figura principal más cercana.
	const owner = new Int32Array(comps.length);
	for (const c of comps) {
		const cx = c.sx / c.n,
			cy = c.sy / c.n;
		let best = 0,
			bestD = Infinity;
		main.forEach((m, k) => {
			const d = Math.hypot(cx - m.sx / m.n, cy - m.sy / m.n);
			if (d < bestD) {
				bestD = d;
				best = k;
			}
		});
		owner[c.id] = best;
	}
	return main.map((m, k) => {
		const parts = comps.filter((c) => owner[c.id] === k);
		const x0 = Math.min(...parts.map((c) => c.x0)) * S,
			y0 = Math.min(...parts.map((c) => c.y0)) * S;
		const x1 = Math.min(W - 1, (Math.max(...parts.map((c) => c.x1)) + 1) * S),
			y1 = Math.min(H - 1, (Math.max(...parts.map((c) => c.y1)) + 1) * S);
		const fw = x1 - x0 + 1,
			fh = y1 - y0 + 1;
		// Máscara a resolución completa: solo los píxeles de esta figura (no los del vecino).
		const own = new Uint8Array(fw * fh);
		let sx = 0,
			sy = 0,
			cnt = 0;
		for (let y = 0; y < fh; y++)
			for (let x = 0; x < fw; x++) {
				const l = label[(((y + y0) / S) | 0) * w + (((x + x0) / S) | 0)];
				const a = data[((y + y0) * W + x + x0) * 4 + 3];
				if (l >= 0 && owner[l] === k && a > 0) {
					own[y * fw + x] = 1;
					if (a > ALPHA_MIN) {
						sx += x;
						sy += y;
						cnt++;
					}
				}
			}
		if (anchor === 'beak') {
			// Pico: píxeles naranjas en la mitad superior (las patas, también naranjas, quedan abajo).
			let bx = 0,
				by = 0,
				bn = 0;
			for (let y = 0; y < fh * 0.6; y++)
				for (let x = 0; x < fw; x++) {
					if (!own[y * fw + x]) continue;
					const i = ((y + y0) * W + x + x0) * 4;
					const r = data[i],
						g = data[i + 1],
						b = data[i + 2];
					if (data[i + 3] > 200 && r > 200 && g > 110 && g < 210 && b < 90) {
						bx += x;
						by += y;
						bn++;
					}
				}
			if (bn > 50)
				return { left: x0, top: y0, width: fw, height: fh, mask: own, cx: bx / bn, cy: by / bn };
		}
		return { left: x0, top: y0, width: fw, height: fh, mask: own, cx: sx / cnt, cy: sy / cnt };
	});
}

function cutFrame(img, f) {
	const { data, width: W } = img;
	const out = Buffer.alloc(f.width * f.height * 4);
	for (let y = 0; y < f.height; y++)
		for (let x = 0; x < f.width; x++) {
			if (f.mask && !f.mask[y * f.width + x]) continue;
			const si = ((y + f.top) * W + x + f.left) * 4;
			data.copy(out, (y * f.width + x) * 4, si, si + 4);
		}
	return out;
}

const EMPTY = { r: 0, g: 0, b: 0, alpha: 0 };

for (const sheet of SHEETS) {
	const img = await loadClean(sheet.src);
	const frames =
		sheet.split === 'auto'
			? autoFrames(img, sheet.frames, sheet.anchor)
			: gridFrames(img, sheet.frames);
	// Celda común: todos los cuadros con su centro de masa en el mismo punto.
	const left = Math.max(...frames.map((f) => f.cx));
	const right = Math.max(...frames.map((f) => f.width - f.cx));
	const up = Math.max(...frames.map((f) => f.cy));
	const down = Math.max(...frames.map((f) => f.height - f.cy));
	const cellW = Math.ceil(left + right),
		cellH = Math.ceil(up + down);
	const outW = Math.round(cellW * (sheet.height / cellH)),
		outH = sheet.height;
	const tiles = [];
	for (const [i, f] of frames.entries()) {
		const cell = await sharp({
			create: { width: cellW, height: cellH, channels: 4, background: EMPTY }
		})
			.composite([
				{
					input: cutFrame(img, f),
					raw: { width: f.width, height: f.height, channels: 4 },
					left: Math.round(left - f.cx),
					top: Math.round(up - f.cy)
				}
			])
			.png()
			.toBuffer();
		tiles.push({
			input: await sharp(cell).resize(outW, outH).png().toBuffer(),
			left: i * outW,
			top: 0
		});
	}
	await sharp({
		create: { width: outW * frames.length, height: outH, channels: 4, background: EMPTY }
	})
		.composite(tiles)
		.png({ compressionLevel: 9 })
		.toFile(`${sheet.out}.png`);
	const meta = { frames: frames.length, frameWidth: outW, frameHeight: outH };
	writeFileSync(`${sheet.out}.json`, JSON.stringify(meta, null, '\t') + '\n');
	console.log(sheet.out, meta);
}
