// Prepara hojas de sprites PNG con transparencia -> tira de cuadros iguales en static/.
// Se respeta el alfa del archivo; solo se limpia el tinte que traen algunos píxeles semitransparentes
// del borde (el color oculto bajo el alfa): magenta por defecto, o `despill: 'green'`.
//
// Dos formas de separar los cuadros:
//   split: 'grid'  -> N columnas del mismo ancho (cuando la IA dejó los cuadros parejos).
//   split: 'auto'  -> cada figura es un grupo de píxeles conectados; se toman las N más grandes
//                     (de izquierda a derecha) y los pedacitos sueltos se suman a la más cercana.
//                     Sirve cuando las alas de un cuadro invaden el ancho del vecino.
// `erode` achica el borde N píxeles (halos de recorte) y `dropSpecks` descarta motas sueltas.
// `pick` elige qué cuadros salen (por índice). Con `beak: true` el .json incluye `beakWidth` (ancho del
// pico naranja en px de salida) para igualar el tamaño del cuerpo entre hojas distintas.
// En 'auto' cada cuadro se alinea por un ancla, para que el cuerpo no "salte" entre cuadros:
//   anchor: 'mass' -> centro de masa;  anchor: 'beak' -> pico naranja (mitad superior de la figura);
//   anchor: 'feet' -> centro horizontal de masa y borde inferior (personajes que caminan).
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const SHEETS = [
	// Pájaro parado: solo el primer cuadro de volando.png (separado por figura, sin restos del vecino).
	{
		src: 'assets/sky/character-sheet.png',
		out: 'static/themes/sky/bird-rest',
		frames: 4,
		pick: [0],
		height: 220,
		split: 'auto',
		beak: true
	},
	// Pájaro volando: los 6 cuadros de volando2.png, alineados por el pico.
	{
		src: 'assets/sky/character2-sheet.png',
		out: 'static/themes/sky/bird-fly',
		frames: 6,
		height: 220,
		split: 'auto',
		anchor: 'beak',
		beak: true
	},
	// Árboles de partida (el pájaro espera parado en la copa). Un cuadro cada uno.
	{
		src: 'assets/sky/tree1.png',
		out: 'static/themes/sky/tree1',
		frames: 1,
		height: 560,
		split: 'auto',
		dropSpecks: true,
		erode: 1
	},
	{
		src: 'assets/sky/tree2.png',
		out: 'static/themes/sky/tree2',
		frames: 1,
		height: 560,
		split: 'auto',
		dropSpecks: true,
		erode: 3
	},
	// Coneja (tema Sendero): parada de perfil (2.º cuadro de las 4 poses) y caminar/saltar (7 cuadros:
	// 0–3 caminar, 4 agachada, 5 subiendo, 6 bajando). Todos alineados por los pies.
	{
		src: 'assets/path/bunny-poses.png',
		out: 'static/themes/path/bunny-rest',
		frames: 4,
		pick: [1],
		height: 240,
		split: 'auto',
		anchor: 'feet',
		despill: 'green'
	},
	{
		src: 'assets/path/bunny-move.png',
		out: 'static/themes/path/bunny-move',
		frames: 7,
		height: 240,
		split: 'auto',
		anchor: 'feet',
		despill: 'green'
	},
	// Zanahorias: 0 derecha, 1 inclinada (se alternan entre notas), 2 con brillos (al recogerla).
	{
		src: 'assets/collectibles/carrots-sheet.png',
		out: 'static/collectibles/carrots',
		frames: 3,
		height: 160,
		split: 'auto'
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

async function loadClean(src, erode = 0, despill = 'magenta') {
	const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	for (let i = 0; i < data.length; i += 4) {
		const a = data[i + 3];
		if (a > 0 && a < 255) {
			const r = data[i],
				g = data[i + 1],
				b = data[i + 2];
			if (despill === 'green') {
				const m = Math.max(0, g - Math.max(r, b));
				data[i + 1] = g - m * 0.9;
			} else {
				const m = Math.max(0, Math.min(r, b) - g);
				data[i] = r - m * 0.8;
				data[i + 2] = b - m * 0.8;
			}
		}
	}
	// Erosión del alfa (mínimo 3×3): quita bordes de recorte de color (halo verde o magenta).
	for (let pass = 0; pass < erode; pass++) {
		const a = new Uint8Array(info.width * info.height);
		for (let i = 0; i < a.length; i++) a[i] = data[i * 4 + 3];
		for (let y = 1; y < info.height - 1; y++)
			for (let x = 1; x < info.width - 1; x++) {
				let m = 255;
				for (let dy = -1; dy <= 1; dy++)
					for (let dx = -1; dx <= 1; dx++) m = Math.min(m, a[(y + dy) * info.width + x + dx]);
				data[(y * info.width + x) * 4 + 3] = m;
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
function autoFrames(img, n, anchor = 'mass', dropSpecks = false) {
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
	const biggest = main.reduce((a, b) => Math.max(a, b.n), 0);
	for (const c of comps) {
		// Motas sueltas (restos de recorte) se descartan si se pidió.
		if (dropSpecks && c.n < biggest * 0.01 && !main.includes(c)) {
			owner[c.id] = -1;
			continue;
		}
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
		const cy = anchor === 'feet' ? fh : sy / cnt;
		return { left: x0, top: y0, width: fw, height: fh, mask: own, cx: sx / cnt, cy };
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

/** Ancho (px de origen) de los píxeles naranjas en la mitad superior de la figura: el pico. */
function beakWidth(img, f) {
	const { data, width: W } = img;
	let x0 = Infinity,
		x1 = -Infinity,
		n = 0;
	for (let y = 0; y < f.height * 0.6; y++)
		for (let x = 0; x < f.width; x++) {
			if (f.mask && !f.mask[y * f.width + x]) continue;
			const i = ((y + f.top) * W + x + f.left) * 4;
			const r = data[i],
				g = data[i + 1],
				b = data[i + 2];
			if (data[i + 3] > 200 && r > 200 && g > 110 && g < 210 && b < 90) {
				x0 = Math.min(x0, x);
				x1 = Math.max(x1, x);
				n++;
			}
		}
	return n > 50 ? x1 - x0 + 1 : 0;
}

const EMPTY = { r: 0, g: 0, b: 0, alpha: 0 };

const only = process.argv[2];
for (const sheet of SHEETS.filter((s) => !only || s.out.includes(only))) {
	const img = await loadClean(sheet.src, sheet.erode ?? 0, sheet.despill);
	const all =
		sheet.split === 'auto'
			? autoFrames(img, sheet.frames, sheet.anchor, sheet.dropSpecks)
			: gridFrames(img, sheet.frames);
	const frames = sheet.pick ? sheet.pick.map((i) => all[i]) : all;
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
	const beaks = sheet.beak ? frames.map((f) => beakWidth(img, f)).filter((b) => b > 0) : [];
	const meta = { frames: frames.length, frameWidth: outW, frameHeight: outH };
	if (beaks.length)
		meta.beakWidth = +((beaks.reduce((a, b) => a + b, 0) / beaks.length) * (outH / cellH)).toFixed(
			2
		);
	writeFileSync(`${sheet.out}.json`, JSON.stringify(meta, null, '\t') + '\n');
	console.log(sheet.out, meta);
}
