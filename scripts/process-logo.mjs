// Genera el logo, los favicons y el avatar del perfil a partir de PNG con transparencia.
// Recorta al contorno, lo centra en un cuadrado y limpia el tinte magenta de los bordes.
//   crop: 'top' -> en vez de encajar la figura entera, toma el cuadrado de arriba (cabeza y
//                  pulgar), que es lo que se ve bien dentro de un avatar redondo.
import sharp from 'sharp';

const JOBS = [
	{
		src: 'assets/logo/logo.png',
		out: [
			{ file: 'static/logo.png', size: 256 },
			{ file: 'static/favicon-48.png', size: 48 },
			{ file: 'static/favicon-32.png', size: 32 },
			{ file: 'static/apple-touch-icon.png', size: 180, background: '#f4f6fb' }
		]
	},
	{
		src: 'assets/logo/avatar.png',
		crop: 'top',
		out: [{ file: 'static/avatar.png', size: 192 }]
	}
];

for (const job of JOBS) {
	const { data, info } = await sharp(job.src)
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });
	for (let i = 0; i < data.length; i += 4) {
		const a = data[i + 3];
		if (a > 0 && a < 255) {
			const m = Math.max(0, Math.min(data[i], data[i + 2]) - data[i + 1]);
			data[i] -= m * 0.8;
			data[i + 2] -= m * 0.8;
		}
	}
	let trimmed = await sharp(data, { raw: info }).png().trim({ threshold: 1 }).toBuffer();
	if (job.crop === 'top') {
		const { width, height } = await sharp(trimmed).metadata();
		const side = Math.min(width, height);
		trimmed = await sharp(trimmed)
			.extract({ left: Math.round((width - side) / 2), top: 0, width: side, height: side })
			.toBuffer();
	}

	for (const o of job.out) {
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
}
