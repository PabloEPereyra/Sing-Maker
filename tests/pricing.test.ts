// La página de precios muestra los mismos números que usa el servidor para cobrar.
import { describe, expect, it } from 'vitest';
import { pricingDoc } from '../src/lib/legal';
import { CREDIT_COSTS, FREE_LIMITS, PUBLIC_PACKS } from '../src/lib/pricing';
import { DEFAULT_COSTS, DEFAULT_LIMITS } from '../src/lib/server/quota';

const text = (lang: 'es' | 'en') =>
	pricingDoc(lang)
		.sections.flatMap((s) => s.body)
		.join('\n');

describe('precios', () => {
	it('el servidor cobra con los números de pricing.ts', () => {
		expect(DEFAULT_LIMITS).toBe(FREE_LIMITS);
		expect(DEFAULT_COSTS).toBe(CREDIT_COSTS);
	});

	it('la página muestra el cupo gratis, los paquetes y el costo de un personaje', () => {
		const es = text('es');
		expect(es).toContain(`${FREE_LIMITS.exercises} ejercicios`);
		expect(es).toContain(`${FREE_LIMITS.characters} personajes`);
		for (const p of PUBLIC_PACKS) expect(es).toContain(`${p.credits} créditos: US$ ${p.price}`);
		expect(es).toContain('alrededor de 13 créditos');
		expect(text('en')).toContain('around 13 credits');
	});

	it('las dos versiones tienen las mismas secciones', () => {
		expect(pricingDoc('es').sections).toHaveLength(pricingDoc('en').sections.length);
	});
});
