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

/** Nota guía (personajes voladores): línea suave con ♪; suena y el personaje la "canta" solo. */
export function drawHintPerch(
	g: CanvasRenderingContext2D,
	x: number,
	y: number,
	width: number,
	past: boolean
): void {
	g.save();
	g.globalAlpha = past ? 0.25 : 0.75;
	g.lineCap = 'round';
	// Un trazo azulado debajo para que se lea sobre las nubes blancas.
	g.strokeStyle = 'rgba(50,100,180,0.25)';
	g.lineWidth = 7;
	g.beginPath();
	g.moveTo(x + 3, y + 1);
	g.lineTo(x + width - 3, y + 1);
	g.stroke();
	g.strokeStyle = '#ffffff';
	g.lineWidth = 4;
	g.beginPath();
	g.moveTo(x + 3, y);
	g.lineTo(x + width - 3, y);
	g.stroke();
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
