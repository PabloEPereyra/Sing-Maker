// Fondo creado con IA puesto sobre un tema de fábrica: se cambia solo lo que se ve de fondo (y, para los
// caminantes, la altura del suelo y las plataformas, que toman los colores del fondo y la forma que eligió Spark);
// el personaje y el punto de partida siguen siendo del tema.
import type { SceneRecord } from '$lib/character/assets.svelte';
import type { Theme } from '../theme';
import { drawPerchLabel, drawScrollingBackground, loadImage } from './common';
import {
	css,
	DEFAULT_PALETTE,
	drawPlatform,
	samplePalette,
	type PlatformPalette
} from './platform';

/** Velocidad del fondo respecto de las notas (paralaje), como en los temas de fábrica. */
const PARALLAX = { walk: 0.45, fly: 0.3 } as const;

const cache = new Map<string, Theme>();

/** Un número por imagen distinta: un fondo retocado (otra imagen con el mismo id) no reusa el tema viejo. */
const imageIds = new WeakMap<Blob, number>();
let lastImageId = 0;
function imageId(image: Blob): number {
	let id = imageIds.get(image);
	if (id === undefined) imageIds.set(image, (id = ++lastImageId));
	return id;
}

export function withScene(theme: Theme, scene: SceneRecord): Theme {
	// También cuenta la altura del suelo: editarla cambia por dónde camina y los colores de las plataformas.
	const key = `${theme.id}|${scene.id}|${scene.platform ?? ''}|${scene.ground}|${imageId(scene.image)}`;
	const cached = cache.get(key);
	if (cached) return cached;
	let image: HTMLImageElement | null = null;
	let palette: PlatformPalette = DEFAULT_PALETTE;
	const walker = theme.movement === 'walk';
	const out: Theme = {
		...theme,
		id: `${theme.id}+${scene.id}`,
		async load() {
			await theme.load();
			if (image) return;
			const url = URL.createObjectURL(scene.image);
			try {
				image = await loadImage(url);
				palette = samplePalette(image, scene.ground);
			} finally {
				URL.revokeObjectURL(url);
			}
		},
		drawBackground(g, w, h, scroll, progress) {
			if (!image) return theme.drawBackground(g, w, h, scroll, progress);
			drawScrollingBackground(g, image, w, h, scroll * PARALLAX[theme.movement]);
			// Hacia el final la luz se vuelve dorada, como al atardecer (igual que los temas de fábrica).
			if (progress > 0) {
				const warm = g.createLinearGradient(0, 0, 0, h);
				warm.addColorStop(0, `rgba(255,190,120,${0.22 * progress})`);
				warm.addColorStop(1, `rgba(200,110,60,${0.18 * progress})`);
				g.fillStyle = warm;
				g.fillRect(0, 0, w, h);
			}
		},
		startSurface: walker ? (h) => h * scene.ground : theme.startSurface,
		drawPerch: walker
			? (g, x, y, width, info) => {
					// La plataforma de la nota guía (vacía, solo contorno) sigue siendo la del tema.
					if (info.hint || !image) return theme.drawPerch(g, x, y, width, info);
					drawPlatform(g, scene.platform ?? 'log', x, info.footY, width, 11, palette, info.past);
					drawPerchLabel(g, x, y, info.label, info.past, css(palette.dark, 0.6));
				}
			: theme.drawPerch
	};
	cache.set(key, out);
	return out;
}
