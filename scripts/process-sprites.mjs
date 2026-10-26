// Recorta y escala una hoja de sprites PNG con transparencia: N cuadros iguales en horizontal
// -> tira en static/themes/<tema>/. Se respeta el alfa del archivo; solo se limpia el tinte magenta
// que traen algunos píxeles semitransparentes del borde (el color oculto bajo el alfa es magenta).
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const SHEETS = [{ src: 'assets/sky/character-sheet.png', out: 'static/themes/sky/character', frames: 4, height: 220 }];

for (const sheet of SHEETS) {
	const { data, info } = await sharp(sheet.src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
	const { width, height } = info;
	for (let i = 0; i < data.length; i += 4) {
		const a = data[i + 3];
		if (a > 0 && a < 255) {
			const r = data[i], g = data[i + 1], b = data[i + 2];
			const m = Math.max(0, Math.min(r, b) - g);
			data[i] = r - m * 0.8;
			data[i + 2] = b - m * 0.8;
		}
	}
	// bbox común de todos los cuadros (relativo al cuadro)
	const fw = Math.floor(width / sheet.frames);
	let minX = fw, minY = height, maxX = 0, maxY = 0;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (data[(y * width + x) * 4 + 3] > 20) {
				const fx = x % fw;
				if (fx < minX) minX = fx;
				if (fx > maxX) maxX = fx;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
			}
		}
	}
	const cw = maxX - minX + 1, ch = maxY - minY + 1;
	const scale = sheet.height / ch;
	const outW = Math.round(cw * scale), outH = sheet.height;
	const keyed = sharp(data, { raw: { width, height, channels: 4 } });
	const keyedPng = await keyed.png().toBuffer();
	const frames = [];
	for (let f = 0; f < sheet.frames; f++) {
		frames.push(
			await sharp(keyedPng)
				.extract({ left: f * fw + minX, top: minY, width: cw, height: ch })
				.resize(outW, outH)
				.png()
				.toBuffer()
		);
	}
	await sharp({ create: { width: outW * sheet.frames, height: outH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
		.composite(frames.map((input, f) => ({ input, left: f * outW, top: 0 })))
		.png({ compressionLevel: 9 })
		.toFile(`${sheet.out}.png`);
	writeFileSync(`${sheet.out}.json`, JSON.stringify({ frames: sheet.frames, frameWidth: outW, frameHeight: outH }, null, '\t') + '\n');
	console.log(sheet.out, { frames: sheet.frames, frameWidth: outW, frameHeight: outH });
}
