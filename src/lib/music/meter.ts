// Compás de un ejercicio. Las duraciones siempre se escriben en negras (0.5 = corchea), como en
// vocalizator; el compás dice cómo se cuentan:
//   simple (x/4):    el pulso es la negra; 4/4 = 4 pulsos de 1 tiempo.
//   compuesto (x/8): el pulso del metrónomo es la corchea; 6/8 = 6 corcheas = 3 tiempos de negra.

export interface Meter {
	/** Pulsos por compás (numerador): 4 en 4/4, 6 en 6/8. */
	beatsPerMeasure: number;
	/** Figura del pulso (denominador): 4 = negra, 8 = corchea. */
	subdivision: number;
}

export type MeterId = '4/4' | '6/8';

export const METERS: Record<MeterId, Meter> = {
	'4/4': { beatsPerMeasure: 4, subdivision: 4 },
	'6/8': { beatsPerMeasure: 6, subdivision: 8 }
};

/** Duración de un pulso del metrónomo, en negras (1 en x/4, 0.5 en x/8). */
export function tickBeats(m: Meter): number {
	return 4 / (m.subdivision === 8 ? 8 : 4);
}

/** Duración de un compás, en negras (4 en 4/4, 3 en 6/8). */
export function measureBeats(m: Meter): number {
	return m.beatsPerMeasure * tickBeats(m);
}

/** Familia de patrones de batería que le corresponde: compases simples o compuestos. */
export function meterFamily(m: Meter): MeterId {
	return m.subdivision === 8 ? '6/8' : '4/4';
}

/** Compás escrito como se lee: "4/4", "6/8"… */
export function meterLabel(m: Meter): string {
	return `${m.beatsPerMeasure}/${m.subdivision}`;
}
