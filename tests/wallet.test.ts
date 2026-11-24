// Lo que muestran el ticket de la pantalla, el costo junto a los títulos y el recuadro de los creadores.
import { describe, expect, it } from 'vitest';
import { CREDIT_COSTS } from '../src/lib/pricing';
import {
	allowanceFor,
	creditCost,
	isEstimate,
	ticketFor,
	type QuotaReport
} from '../src/lib/wallet.svelte';

const none = { exercises: 0, characters: 0, images: 0, other: 0 };
const report = (extra: Partial<QuotaReport> = {}): QuotaReport => ({
	open: false,
	name: 'device:x',
	used: none,
	limits: { exercises: 3, characters: 0, images: 0, other: 20 },
	auth: true,
	account: null,
	costs: CREDIT_COSTS,
	welcome: 40,
	...extra
});
const withCredits = (credits: number) => report({ account: { email: 'a@b.co', credits } });

describe('ticket de la pantalla', () => {
	it('con sesión muestra el saldo, y avisa si no alcanza para un personaje', () => {
		expect(ticketFor(withCredits(290), 'adult')).toEqual({
			kind: 'balance',
			credits: 290,
			low: false
		});
		expect(ticketFor(withCredits(13), 'adult')).toMatchObject({ low: false });
		expect(ticketFor(withCredits(12), 'adult')).toMatchObject({ low: true });
		expect(ticketFor(withCredits(0), 'adult')).toMatchObject({ credits: 0, low: true });
	});

	it('sin sesión ofrece el regalo, aunque todavía no haya dicho su edad', () => {
		expect(ticketFor(report(), 'unknown')).toEqual({ kind: 'gift', credits: 40 });
		expect(ticketFor(report({ welcome: 0 }), 'unknown')).toBeNull();
	});

	it('no se muestra a menores, sin cuentas ni sin datos', () => {
		expect(ticketFor(withCredits(290), 'minor')).toBeNull();
		expect(ticketFor(report(), 'minor')).toBeNull();
		expect(ticketFor(report({ auth: undefined, account: undefined }), 'adult')).toBeNull();
		expect(ticketFor(null, 'adult')).toBeNull();
	});
});

describe('costo de crear', () => {
	it('usa los costos del servidor; un objeto es su diseño más una hoja', () => {
		expect(creditCost('exercise')).toBe(1);
		expect(creditCost('scene')).toBe(2);
		expect(creditCost('item')).toBe(7);
		expect(creditCost('character')).toBe(13);
		expect(creditCost('exercise', { ...CREDIT_COSTS, exercises: 3 })).toBe(3);
	});

	it('personajes y objetos son estimados (dependen del tipo y los reintentos)', () => {
		expect((['exercise', 'scene', 'item', 'character'] as const).map(isEstimate)).toEqual([
			false,
			false,
			true,
			true
		]);
	});

	it('los objetos piden cuenta igual que los personajes', () => {
		expect(allowanceFor(report(), 'item')).toEqual({ kind: 'claim', welcome: 40 });
		expect(allowanceFor(withCredits(5), 'item')).toEqual({ kind: 'credits', cost: 7, credits: 5 });
		expect(allowanceFor(report(), 'exercise')).toMatchObject({ kind: 'free', left: 3 });
	});
});
