// Genera el logo y los favicons a partir de assets/logo/logo.png (PNG con transparencia).
// Recorta al contorno, lo centra en un cuadrado y limpia el tinte magenta de los bordes.
import sharp from 'sharp';

const SRC = 'assets/logo/logo.png';
const OUT = [
	{ file: 'static/logo.png', size: 256 },
	{ file: 'static/favicon-48.png', size: 48 },
	{ file: 'static/favicon-32.png', size: 32 },
	{ file: 'static/apple-touch-icon.png', size: 180, background: '#f4f6fb' }
];

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
for (let i = 0; i < data.length; i += 4) {
	const a = data[i + 3];
	if (a > 0 && a < 255) {
		const m = Math.max(0, Math.min(data[i], data[i + 2]) - data[i + 1]);
		data[i] -= m * 0.8;
		data[i + 2] -= m * 0.8;
	}
}
const trimmed = await sharp(data, { raw: info }).png().trim({ threshold: 1 }).toBuffer();

for (const o of OUT) {
	const inner = Math.round(o.size * (o.background ? 0.86 : 1));
	const img = await sharp(trimmed)
		.resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
		.toBuffer();
	await sharp({
		create: {
			width: o.size,
			height: o.size,
			channels: 4,
			background: o.background ?? { r: 0, g: 0, b: 0, alpha: 0 }
		}
	})
		.composite([{ input: img, gravity: 'center' }])
		.png({ compressionLevel: 9 })
		.toFile(o.file);
	console.log(o.file);
}
