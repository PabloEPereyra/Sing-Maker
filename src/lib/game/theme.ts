// Un tema define el aspecto del juego: escenario, personaje y perchas (las notas). Los objetos
// para recolectar son aparte (collectibles.ts) y se combinan con cualquier tema.
// El motor (game.ts) solo calcula posiciones y estados; todo el dibujo pasa por aquí,
// así se pueden sumar otros mundos sin tocar el motor. Hay dos tipos de personaje (`movement`):
//   'fly'  -> vuela a la altura que se canta (pájaro); las perchas son invisibles.
//   'walk' -> camina: las notas son plataformas, salta en arco entre ellas y en silencio cae al suelo.

export type CollectibleState = 'idle' | 'collected' | 'missed';

export interface CharacterState {
	/** El ejercicio está en marcha (vuela o camina); si no, espera parado en el punto de partida. */
	flying: boolean;
	/** El mundo avanza (cuenta previa o ejercicio): el caminante camina; en pausa o al final, no. */
	moving: boolean;
	/** Caminante: en el aire (saltando o cayendo), sin pisar plataforma ni suelo. */
	airborne: boolean;
	/** Caminante: segundos desde que tocó una superficie (para la pose de aterrizaje). */
	sinceLanding: number;
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
	/** Altura (px) de los pies del personaje sobre esta nota: donde va la plataforma del caminante. */
	footY: number;
}

export interface Theme {
	id: string;
	name: string;
	movement: 'fly' | 'walk';
	load(): Promise<void>;
	/** `scroll` = distancia recorrida en px; `progress` 0–1 del ejercicio. */
	drawBackground(
		g: CanvasRenderingContext2D,
		w: number,
		h: number,
		scroll: number,
		progress: number
	): void;
	/**
	 * Altura (px) donde se para el personaje antes de empezar, para un canvas de alto `h`. Para un
	 * caminante es además el suelo al que cae en los silencios.
	 */
	startSurface(h: number): number;
	/** Punto de partida (árbol, suelo…) centrado en `x`, la posición del personaje en la espera. */
	drawStart(g: CanvasRenderingContext2D, x: number, w: number, h: number): void;
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
