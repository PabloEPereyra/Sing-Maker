// Precios de Vocal Quest en un solo lugar: el cupo gratis y lo que cuesta cada uso los usa el servidor
// (src/lib/server/quota.ts, como valores por defecto de LIMIT_* y CREDIT_COST_*) y la página pública /pricing.
// Sin dependencias: lo importan tanto las funciones de Cloudflare como el navegador.

/** Tipos de uso que se cuentan: ejercicios y ritmos, personajes, imágenes (tiras y fondos) y el resto. */
export type Bucket = 'exercises' | 'characters' | 'images' | 'other';

/**
 * Cupo gratis de cada persona (de por vida, no se renueva); después se paga con créditos. Alcanza para probar
 * crear con IA sin reemplazar la compra: 10 ejercicios o ritmos y 2 personajes completos.
 */
export const FREE_LIMITS: Record<Bucket, number> = {
	exercises: 10,
	characters: 2,
	// Tiras y fondos: unas 4 tiras por personaje, más algún reintento o un fondo.
	images: 12,
	// Entrenador, dictado y llamadas auxiliares de los personajes (interpretar el pedido, revisar, recortar).
	// Al agotarse, el entrenador sigue con la devolución sin IA.
	other: 150
};

/**
 * Créditos por llamada una vez agotado el cupo gratis. Un personaje completo es la imagen principal más unas 4
 * tiras (~13 créditos); con 1 crédito ≈ US$ 0,01 de costo de IA y el paquete a 4–5×, deja margen.
 */
export const CREDIT_COSTS: Record<Bucket, number> = {
	exercises: 1,
	characters: 5,
	images: 2,
	other: 0
};

/** Tiras de animación que lleva un personaje completo (para estimar su costo en la página de precios). */
export const STRIPS_PER_CHARACTER = 4;

/**
 * Paquetes que se muestran en /pricing. Los que se venden de verdad son los de DODO_PACKS (variable del proyecto
 * en Cloudflare, con los ids de producto de Dodo): si cambian, actualizar también esta lista.
 */
export const PUBLIC_PACKS: { credits: number; price: number }[] = [
	{ credits: 250, price: 10 },
	{ credits: 600, price: 20 }
];

/** Días para pedir el reembolso de un paquete sin usar. */
export const REFUND_DAYS = 14;
