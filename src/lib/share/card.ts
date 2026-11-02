// Tarjeta compartible del final de un ejercicio: una imagen vertical (4:5) con la escena del juego (el
// personaje y el fondo que eligió la persona), el nombre del ejercicio y el resultado. Se arma en el navegador
// con un canvas: no usa la IA, así que no cuesta nada ni gasta cupo.

export interface CardInfo {
	/** Nombre del ejercicio. */
	title: string;
	/** Porcentaje de estrellas recogidas (0–100). */
	pct: number;
	collected: number;
	total: number;
	/** Línea de abajo: dificultad y fecha, ya traducidas. */
	footer: string;
	/** «Ejercicio completado». */
	heading: string;
	/** «34 de 40 estrellas». */
	detail: string;
}

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;
/** Alto de la zona de la escena; el panel de resultados se monta encima de su borde de abajo. */
const SCENE_HEIGHT = 840;
const PANEL_TOP = 770;

const ACCENT = '#5c7bfa';
const ACCENT_DARK = '#3a55c8';
const STAR = '#ffc928';

/** Dibuja `source` cubriendo el rectángulo, recortando lo que sobre (como `object-fit: cover`). */
function drawCover(
	g: CanvasRenderingContext2D,
	source: CanvasImageSource,
	sw: number,
	sh: number,
	x: number,
	y: number,
	w: number,
	h: number
): void {
	const scale = Math.max(w / sw, h / sh);
	const cw = w / scale;
	const ch = h / scale;
	g.drawImage(source, (sw - cw) / 2, (sh - ch) / 2, cw, ch, x, y, w, h);
}

/** Achica la letra hasta que el texto entre en `maxWidth`. */
function fitText(
	g: CanvasRenderingContext2D,
	text: string,
	family: string,
	size: number,
	maxWidth: number
): void {
	let px = size;
	do {
		g.font = `${px}px ${family}`;
		px -= 2;
	} while (g.measureText(text).width > maxWidth && px > 24);
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
	return new Promise((resolve) => {
		const img = new Image();
		img.onload = () => resolve(img);
		img.onerror = () => resolve(null);
		img.src = src;
	});
}

/** Texto con contorno oscuro y relleno claro, como los números del juego. */
function outlined(
	g: CanvasRenderingContext2D,
	text: string,
	x: number,
	y: number,
	stroke: number,
	fill = '#fff'
): void {
	g.lineJoin = 'round';
	g.lineWidth = stroke;
	g.strokeStyle = ACCENT_DARK;
	g.strokeText(text, x, y);
	g.fillStyle = fill;
	g.fillText(text, x, y);
}

/**
 * Arma la tarjeta. `scene` es el canvas del juego (si no se puede leer, queda un cielo liso).
 * Espera a que estén cargadas las tipografías del juego para que el texto salga igual que en pantalla.
 */
export async function composeCard(
	scene: HTMLCanvasElement | null,
	info: CardInfo
): Promise<HTMLCanvasElement> {
	await Promise.all([
		document.fonts.load('100px Boogaloo'),
		document.fonts.load('40px "Bricolage Grotesque"')
	]).catch(() => undefined);

	const canvas = document.createElement('canvas');
	canvas.width = CARD_WIDTH;
	canvas.height = CARD_HEIGHT;
	const g = canvas.getContext('2d')!;
	const display = 'Boogaloo, "Bricolage Grotesque", system-ui, sans-serif';
	const body = '"Bricolage Grotesque", system-ui, sans-serif';

	// Escena
	const sky = g.createLinearGradient(0, 0, 0, SCENE_HEIGHT);
	sky.addColorStop(0, '#9fd0ff');
	sky.addColorStop(1, '#e6f1ff');
	g.fillStyle = sky;
	g.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);
	if (scene && scene.width > 0 && scene.height > 0) {
		try {
			drawCover(g, scene, scene.width, scene.height, 0, 0, CARD_WIDTH, SCENE_HEIGHT);
		} catch {
			// canvas contaminado por una imagen de otro origen: queda el cielo liso
		}
	}

	// Marca arriba a la izquierda
	const logo = await loadImage('/logo.png');
	if (logo) g.drawImage(logo, 36, 30, 120, 120);
	g.textBaseline = 'alphabetic';
	g.textAlign = 'left';
	g.font = `64px ${display}`;
	outlined(g, 'Sing Maker', 172, 112, 16);

	// Panel de resultados
	const panel = g.createLinearGradient(0, PANEL_TOP, 0, CARD_HEIGHT);
	panel.addColorStop(0, ACCENT);
	panel.addColorStop(1, ACCENT_DARK);
	g.fillStyle = panel;
	g.beginPath();
	g.roundRect(0, PANEL_TOP, CARD_WIDTH, CARD_HEIGHT - PANEL_TOP + 60, 56);
	g.fill();
	g.lineWidth = 10;
	g.strokeStyle = 'rgba(255,255,255,0.85)';
	g.beginPath();
	g.roundRect(5, PANEL_TOP + 5, CARD_WIDTH - 10, CARD_HEIGHT - PANEL_TOP + 60, 52);
	g.stroke();

	g.textAlign = 'center';
	g.fillStyle = 'rgba(255,255,255,0.8)';
	g.font = `40px ${body}`;
	g.fillText(info.heading.toUpperCase(), CARD_WIDTH / 2, PANEL_TOP + 90);

	g.fillStyle = '#fff';
	fitText(g, info.title, display, 72, CARD_WIDTH - 140);
	g.fillText(info.title, CARD_WIDTH / 2, PANEL_TOP + 175);

	g.font = `230px ${display}`;
	outlined(g, `${info.pct}%`, CARD_WIDTH / 2, PANEL_TOP + 400, 26);

	// Cinco estrellas: se llenan según el porcentaje
	const lit = Math.round(info.pct / 20);
	const gap = 118;
	for (let i = 0; i < 5; i++) {
		g.fillStyle = i < lit ? STAR : 'rgba(255,255,255,0.3)';
		// dibujada con trazos: el carácter ★ cambia según la fuente del móvil
		g.beginPath();
		for (let k = 0; k < 10; k++) {
			const r = k % 2 === 0 ? 46 : 19;
			const a = -Math.PI / 2 + (k * Math.PI) / 5;
			const px = CARD_WIDTH / 2 + (i - 2) * gap + Math.cos(a) * r;
			const py = PANEL_TOP + 478 + Math.sin(a) * r;
			if (k === 0) g.moveTo(px, py);
			else g.lineTo(px, py);
		}
		g.closePath();
		g.fill();
	}

	g.fillStyle = '#fff';
	g.font = `46px ${body}`;
	g.fillText(info.detail, CARD_WIDTH / 2, PANEL_TOP + 575);
	g.fillStyle = 'rgba(255,255,255,0.8)';
	g.font = `36px ${body}`;
	g.fillText(info.footer, CARD_WIDTH / 2, PANEL_TOP + 625);

	return canvas;
}

/** Convierte el canvas en un archivo PNG. */
export function cardFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
	return new Promise((resolve, reject) =>
		canvas.toBlob(
			(blob) =>
				blob ? resolve(new File([blob], name, { type: 'image/png' })) : reject(new Error('png')),
			'image/png'
		)
	);
}
