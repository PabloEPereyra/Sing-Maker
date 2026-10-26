// Un tema define el aspecto del juego: escenario, personaje y perchas (las notas). Los objetos
// para recolectar son aparte (collectibles.ts) y se combinan con cualquier tema.
// El motor (game.ts) solo calcula posiciones y estados; todo el dibujo pasa por aquí,
// así se pueden sumar otros mundos (p. ej. un caminante que junta monedas) sin tocar el motor.

export type CollectibleState = 'idle' | 'collected' | 'missed';

export interface CharacterState {
	/** Está en el aire (durante el ejercicio); si no, espera parado en el suelo. */
	flying: boolean;
	/** Hay voz detectada en este cuadro. */
	singing: boolean;
	/** El tono cantado coincide con la nota actual. */
	onTarget: boolean;
	/** Velocidad vertical en px/s (positivo = hacia abajo), para inclinar al personaje. */
	vy: number;
}

export interface PerchInfo {
	/** Nota guía: suena pero no se canta. */
	hint: boolean;
	/** Ya pasó por la posición del personaje. */
	past: boolean;
	label: string;
}

export interface Theme {
	id: string;
	name: string;
	load(): Promise<void>;
	/** `scroll` = distancia recorrida en px; `progress` 0–1 del ejercicio. */
	drawBackground(
		g: CanvasRenderingContext2D,
		w: number,
		h: number,
		scroll: number,
		progress: number
	): void;
	/** Suelo de partida desde el borde izquierdo hasta `right`, con la superficie en `top`. */
	drawGround(g: CanvasRenderingContext2D, right: number, top: number, h: number): void;
	drawPerch(
		g: CanvasRenderingContext2D,
		x: number,
		y: number,
		width: number,
		info: PerchInfo
	): void;
	drawCharacter(
		g: CanvasRenderingContext2D,
		x: number,
		y: number,
		size: number,
		time: number,
		state: CharacterState
	): void;
}
