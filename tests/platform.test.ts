import { describe, expect, it } from 'vitest';
import {
	DEFAULT_PALETTE,
	hslToRgb,
	paletteFrom,
	PLATFORM_STYLES,
	rgbToHsl,
	type Rgb
} from '../src/lib/game/themes/platform';

const fill = (c: Rgb, n = 10): Rgb[] => Array.from({ length: n }, () => c);
const lightness = (c: Rgb) => rgbToHsl(c)[2];

describe('paleta de las plataformas', () => {
	it('hsl y rgb son inversos', () => {
		for (const c of [
			[200, 40, 40],
			[10, 120, 200],
			[120, 120, 120],
			[255, 255, 255]
		] as Rgb[]) {
			const back = hslToRgb(...rgbToHsl(c));
			c.forEach((v, i) => expect(Math.abs(v - back[i])).toBeLessThanOrEqual(1));
		}
	});

	it('sin muestras del suelo queda la paleta de fábrica', () => {
		expect(paletteFrom([], fill([10, 10, 10]))).toEqual(DEFAULT_PALETTE);
	});

	it('el tono sale del suelo: arena amarillenta, hielo azulado', () => {
		const sand = paletteFrom(fill([214, 178, 112]), fill([120, 190, 235]));
		const snow = paletteFrom(fill([200, 220, 240]), fill([40, 50, 80]));
		const hue = (c: Rgb) => rgbToHsl(c)[0] * 360;
		expect(hue(sand.body)).toBeGreaterThan(25);
		expect(hue(sand.body)).toBeLessThan(55);
		expect(hue(snow.body)).toBeGreaterThan(190);
		expect(hue(snow.body)).toBeLessThan(230);
	});

	it('se distingue del fondo que tiene detrás: si son parecidos, se aleja en luminosidad', () => {
		const same: Rgb = [150, 150, 150];
		const pal = paletteFrom(fill(same), fill(same));
		expect(Math.abs(lightness(pal.body) - lightness(same))).toBeGreaterThanOrEqual(0.2);
		// Contra un fondo oscuro se aclara y contra uno claro se oscurece.
		expect(lightness(paletteFrom(fill([60, 60, 60]), fill([20, 20, 20])).body)).toBeGreaterThan(
			0.3
		);
		expect(
			lightness(paletteFrom(fill([230, 230, 230]), fill([240, 240, 240])).body)
		).toBeLessThanOrEqual(0.7);
	});

	it('el borde de arriba es más claro que el cuerpo y las sombras, más oscuras', () => {
		const pal = paletteFrom(fill([90, 140, 70]), fill([170, 210, 240]));
		expect(lightness(pal.top)).toBeGreaterThan(lightness(pal.body));
		expect(lightness(pal.dark)).toBeLessThan(lightness(pal.body));
	});

	it('las formas son las que conoce Spark', () => {
		expect([...PLATFORM_STYLES]).toEqual(['log', 'stone', 'ice', 'cloud', 'crystal', 'mushroom']);
	});
});
