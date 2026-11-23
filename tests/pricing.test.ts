// La página de precios muestra los mismos números que usa el servidor para cobrar.
import { describe, expect, it } from 'vitest';
import { pricingDoc } from '../src/lib/legal';
import {
	ANON_LIMITS,
	CREDIT_COSTS,
	FREE_LIMITS,
	PUBLIC_PACKS,
	WELCOME_CREDITS
} from '../src/lib/pricing';
import {
	DEFAULT_ANON_LIMITS,
	DEFAULT_COSTS,
	DEFAULT_LIMITS,
	welcomeCredits
} from '../src/lib/server/quota';

const text = (lang: 'es' | 'en') =>
	pricingDoc(lang)
		.sections.flatMap((s) => s.body)
		.join('\n');

describe('precios', () => {
	it('el servidor cobra con los números de pricing.ts', () => {
		expect(DEFAULT_LIMITS).toBe(FREE_LIMITS);
		expect(DEFAULT_COSTS).toBe(CREDIT_COSTS);
		expect(DEFAULT_ANON_LIMITS).toBe(ANON_LIMITS);
		expect(welcomeCredits({})).toBe(WELCOME_CREDITS);
	});

	it('la página muestra el cupo sin cuenta, el regalo, los paquetes y el costo de un personaje', () => {
		const es = text('es');
		expect(es).toContain(`Sin cuenta: ${ANON_LIMITS.exercises} ejercicios`);
		expect(es).toContain(`${WELCOME_CREDITS} créditos de regalo`);
		expect(text('en')).toContain(`${WELCOME_CREDITS} free credits`);
		for (const p of PUBLIC_PACKS) expect(es).toContain(`${p.credits} créditos: US$ ${p.price}`);
		expect(es).toContain('alrededor de 13 créditos');
		expect(text('en')).toContain('around 13 credits');
	});

	it('el regalo equivale más o menos al viejo cupo gratis (ejercicios y personajes)', () => {
		const character = CREDIT_COSTS.characters + 4 * CREDIT_COSTS.images;
		const old = FREE_LIMITS.exercises * CREDIT_COSTS.exercises + FREE_LIMITS.characters * character;
		expect(WELCOME_CREDITS).toBeGreaterThanOrEqual(old);
		expect(WELCOME_CREDITS).toBeLessThan(old * 1.5);
	});

	it('las dos versiones tienen las mismas secciones', () => {
		expect(pricingDoc('es').sections).toHaveLength(pricingDoc('en').sections.length);
	});
});
