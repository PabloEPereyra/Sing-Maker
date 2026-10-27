// Dibujos que comparten los temas: el nombre de la nota sobre los objetos y la nota guía.

/** Nombre de la nota al comienzo de la percha, sobre los objetos. */
export function drawPerchLabel(
	g: CanvasRenderingContext2D,
	x: number,
	y: number,
	label: string,
	past: boolean,
	outline = 'rgba(20,35,80,0.55)'
): void {
	g.save();
	g.globalAlpha = past ? 0.35 : 0.95;
	g.font = '700 12px system-ui, sans-serif';
	g.lineJoin = 'round';
	g.lineWidth = 3;
	g.strokeStyle = outline;
	g.strokeText(label, x, y - 22);
	g.fillStyle = '#ffffff';
	g.fillText(label, x, y - 22);
	g.restore();
}

/** Nota guía: línea punteada con ♪; suena pero no se canta. */
export function drawHintPerch(
	g: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	past: boolean
): void {
	g.save();
	g.globalAlpha = past ? 0.25 : 0.6;
	g.strokeStyle = '#ffffff';
	g.lineWidth = 3;
	g.setLineDash([8, 8]);
	g.beginPath();
	g.moveTo(x, y);
	g.lineTo(x + width, y);
	g.stroke();
	g.setLineDash([]);
	g.fillStyle = '#ffffff';
	g.font = 'bold 18px system-ui, sans-serif';
	g.fillText('♪', x + 4, y - 8);
	g.restore();
}

export function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const i = new Image();
		i.onload = () => resolve(i);
		i.onerror = reject;
		i.src = src;
	});
}

/** Fondo que cubre el alto del canvas y se repite en espejo (las uniones no se notan). */
export function drawScrollingBackground(
	g: CanvasRenderingContext2D,
	img: HTMLImageElement,
	w: number,
	h: number,
	offsetPx: number
): void {
	const tw = (img.width / img.height) * h;
	const offset = offsetPx % (tw * 2);
	for (let x = -offset, i = 0; x < w; x += tw, i++) {
		if (i % 2 === 0) g.drawImage(img, x, 0, tw, h);
		else {
			g.save();
			g.translate(x + tw, 0);
			g.scale(-1, 1);
			g.drawImage(img, 0, 0, tw, h);
			g.restore();
		}
	}
}
