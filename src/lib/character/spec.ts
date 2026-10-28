// Constantes compartidas entre el servidor (prompts) y el navegador (procesado) del creador de personajes.
export type Movement = 'walk' | 'fly';

/** Fallas esperables del procesado de imágenes: la interfaz las muestra traducidas. */
export class CharacterError extends Error {
	constructor(
		readonly code: 'notFound' | 'fewPoses' | 'emptyPose',
		message: string
	) {
		super(message);
	}
}

export const STYLES = ['cute3d', 'cartoon', 'pixel', 'watercolor'] as const;
export type StyleId = (typeof STYLES)[number];

/** Cuadros que se piden por tira y los que se aceptan al procesarla (SAM a veces junta o pierde uno). */
export const STRIPS = {
	move: { ask: 6, min: 4, max: 8 },
	jump: { ask: 5, min: 3, max: 6 },
	stand: { ask: 2, min: 2, max: 2 }
} as const;
export type StripKind = keyof typeof STRIPS;
