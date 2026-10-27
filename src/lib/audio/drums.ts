// Batería: patrones por compás (en lugar del metrónomo) y la muestra de batería de vocalizator.
// Los patrones 4/4 son los de vocalizator/src/data/patrones.json pasados a texto ("x" = golpe).
// El 6/8 de vocalizator tenía el bombo cada dos corcheas (sentir de 3/4); acá está escrito en 6/8:
// bombo en 1, caja en 4, hi-hat en cada corchea.
import type { MeterId } from '$lib/music/meter';

export type DrumPart = 'kick' | 'snare' | 'hihatClosed' | 'hihatOpen' | 'ride' | 'splash';

export interface DrumPattern {
	id: string;
	name: string;
	meter: MeterId;
	/** Pasos por pulso del metrónomo: 4 en 4/4 (semicorcheas), 2 en 6/8 (semicorcheas de corchea). */
	stepsPerTick: number;
	/** Una pista por instrumento; un carácter por paso ("x" golpe, "." nada). Todas del mismo largo. */
	tracks: Partial<Record<DrumPart, string>>;
}

export const DRUM_PATTERNS: DrumPattern[] = [
	{
		id: 'basic-44',
		name: 'Básico 4/4',
		meter: '4/4',
		stepsPerTick: 4,
		tracks: {
			kick: 'x...x...x...x...x...x...x...x...',
			hihatClosed: 'x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.',
			ride: 'x...............x...............'
		}
	},
	{
		id: 'rock-44',
		name: 'Rock 4/4',
		meter: '4/4',
		stepsPerTick: 4,
		tracks: {
			kick: 'x..x..x...x..x..x..x..x...x.....',
			snare: '....x.......x.......x.......x...',
			hihatClosed: 'x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.',
			splash: '..............................x.'
		}
	},
	{
		id: 'rock-fill-44',
		name: 'Rock 4/4 + fill',
		meter: '4/4',
		stepsPerTick: 4,
		tracks: {
			kick: 'x..x..x...x..x..x..x...x....x...',
			snare: '....x.......x.......x...x.x.x.x.',
			hihatClosed: 'x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.'
		}
	},
	{
		id: 'basic-68',
		name: 'Básico 6/8',
		meter: '6/8',
		stepsPerTick: 2,
		tracks: {
			kick: 'x...........x.........x.',
			snare: '......x...........x.....',
			hihatClosed: 'x.x.x.x.x.x.x.x.x.x.x.x.'
		}
	},
	{
		id: 'ballad-68',
		name: 'Balada 6/8',
		meter: '6/8',
		stepsPerTick: 2,
		tracks: {
			kick: 'x.....x.....x.....x...x.',
			snare: '......x...........x.....',
			ride: 'x.x.x.x.x.x.x.x.x.x.x.x.',
			hihatOpen: '......................x.'
		}
	}
];

export function patternsFor(meter: MeterId): DrumPattern[] {
	return DRUM_PATTERNS.filter((p) => p.meter === meter);
}

export function patternById(id: string | undefined, meter: MeterId): DrumPattern {
	const list = patternsFor(meter);
	return list.find((p) => p.id === id) ?? list[0];
}

/** Largo del patrón en pasos (todas las pistas miden lo mismo). */
export function patternSteps(p: DrumPattern): number {
	return Math.max(...Object.values(p.tracks).map((t) => t!.length));
}

/** Instrumentos que suenan en el paso `step` (el patrón se repite). */
export function hitsAt(p: DrumPattern, step: number): DrumPart[] {
	const n = patternSteps(p);
	const i = ((step % n) + n) % n;
	return (Object.entries(p.tracks) as [DrumPart, string][])
		.filter(([, t]) => t[i] === 'x')
		.map(([part]) => part);
}
