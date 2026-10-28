// Fondo creado con IA puesto sobre un tema de fábrica: se cambia solo lo que se ve de fondo (y, para los
// caminantes, la altura del suelo); el personaje, las plataformas y el punto de partida siguen siendo del tema.
import type { SceneRecord } from '$lib/character/assets.svelte';
import type { Theme } from '../theme';
import { drawScrollingBackground, loadImage } from './common';

/** Velocidad del fondo respecto de las notas (paralaje), como en los temas de fábrica. */
const PARALLAX = { walk: 0.45, fly: 0.3 } as const;

const cache = new Map<string, Theme>();

export function withScene(theme: Theme, scene: SceneRecord): Theme {
	const key = `${theme.id}|${scene.id}`;
	const cached = cache.get(key);
	if (cached) return cached;
	let image: HTMLImageElement | null = null;
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
		startSurface: walker ? (h) => h * scene.ground : theme.startSurface
	};
	cache.set(key, out);
	return out;
}
