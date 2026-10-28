// Constantes compartidas entre el servidor (prompts) y el navegador (procesado) del creador de personajes.
export type Movement = 'walk' | 'fly';

/** Fallas esperables del procesado de imágenes: la interfaz las muestra traducidas. */
export class CharacterError extends Error {
	constructor(
		readonly code: 'notFound' | 'fewPoses' | 'emptyPose' | 'refused',
		message: string
	) {
		super(message);
	}
}

export const STYLES = [
	'cute3d',
	'cartoon',
	'anime',
	'ligneclaire',
	'comic',
	'clay',
	'flatvector',
	'pixel',
	'watercolor'
] as const;
export type StyleId = (typeof STYLES)[number];

/**
 * Hojas de poses que se piden: una grilla de `cols`×`rows` celdas, una pose por celda, en orden de lectura
 * (izquierda a derecha, arriba a abajo). Cada pose tiene su celda y su margen, así ninguna pieza (aspas,
 * capas, colas) pisa a la vecina. `min` = poses que se aceptan si el modelo dejó celdas vacías.
 */
export const STRIPS = {
	move: { cols: 3, rows: 2, ask: 6, min: 4, max: 6 },
	jump: { cols: 3, rows: 2, ask: 6, min: 3, max: 6 },
	stand: { cols: 2, rows: 1, ask: 2, min: 2, max: 2 }
} as const;
export type StripKind = keyof typeof STRIPS;
