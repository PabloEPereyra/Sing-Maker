// Saldo de IA de la persona, compartido por el menú de perfil y los creadores: lo gastado del cupo gratis, los
// créditos de su cuenta, lo que cuesta cada uso y el regalo por crear la cuenta. Lo da /api/quota y se vuelve a
// pedir después de cada llamada a la IA (src/lib/ai/http.ts) y al entrar o salir de la cuenta.
import { identityHeaders } from './access.svelte';
import type { Bucket } from './pricing';
import { CREDIT_COSTS, STRIPS_PER_CHARACTER } from './pricing';

export interface QuotaReport {
	open: boolean;
	codes?: boolean;
	name?: string;
	used?: Record<Bucket, number>;
	limits?: Record<Bucket, number>;
	auth?: boolean;
	account?: { email: string; credits: number } | null;
	costs?: Record<Bucket, number>;
	welcome?: number;
	packs?: { productId: string; credits: number; price: number }[];
}

/** `none`: sin servidor de cupos; `locked`: hay códigos y falta uno válido; `ok`: persona reconocida. */
export const wallet = $state<{
	mode: 'unknown' | 'none' | 'locked' | 'ok';
	report: QuotaReport | null;
}>({ mode: 'unknown', report: null });

let pending: Promise<void> | null = null;
let again = false;

async function fetchWallet(): Promise<void> {
	try {
		const res = await fetch('/api/quota', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...identityHeaders() },
			body: '{}'
		});
		const data = (await res.json().catch(() => null)) as QuotaReport | null;
		if (res.status === 401) {
			wallet.mode = 'locked';
			wallet.report = null;
		} else if (res.ok && data?.open) {
			wallet.mode = 'none';
			wallet.report = null;
		} else if (res.ok && data?.name) {
			wallet.mode = 'ok';
			wallet.report = data;
		} else wallet.mode = 'none';
	} catch {
		wallet.mode = 'none';
	}
}

/**
 * Vuelve a pedir el saldo. Si ya hay un pedido en curso, se repite una vez al terminar: ese pedido pudo salir
 * antes del último gasto.
 */
export function refreshWallet(): Promise<void> {
	if (pending) {
		again = true;
		return pending;
	}
	pending = (async () => {
		do {
			again = false;
			await fetchWallet();
		} while (again);
		pending = null;
	})();
	return pending;
}

/** Lo que gasta crear algo: un personaje completo es la imagen principal más sus tiras. */
export type Spend = 'exercise' | 'character' | 'scene';

const BUCKET_OF: Record<Spend, Bucket> = {
	exercise: 'exercises',
	character: 'characters',
	scene: 'images'
};

/** Créditos que cuesta, con los costos del servidor (o los de pricing.ts si todavía no llegaron). */
export function creditCost(spend: Spend, costs: Record<Bucket, number> = CREDIT_COSTS): number {
	if (spend === 'character') return costs.characters + STRIPS_PER_CHARACTER * costs.images;
	return costs[BUCKET_OF[spend]];
}

/**
 * Qué mostrar al lado del botón de crear:
 * - `credits`: tiene sesión; cuesta `cost` y le quedan `credits`.
 * - `free`: sin sesión, le quedan `left` de `limit` gratis (y, si hay cuentas, el regalo `welcome` al entrar).
 * - `claim`: sin sesión y sin cupo para esto: que cree la cuenta y reciba `welcome` créditos.
 * - `out`: sin cupo y sin cuentas (el tope es el tope).
 * - `null`: no hay nada que contar (desarrollo o sin datos todavía).
 */
export type Allowance =
	| { kind: 'credits'; cost: number; credits: number }
	| { kind: 'free'; left: number; limit: number; welcome: number }
	| { kind: 'claim'; welcome: number }
	| { kind: 'out' }
	| null;

export function allowanceFor(report: QuotaReport | null, spend: Spend): Allowance {
	if (!report?.used || !report.limits) return null;
	const bucket = BUCKET_OF[spend];
	if (report.auth && report.account)
		return {
			kind: 'credits',
			cost: creditCost(spend, report.costs),
			credits: report.account.credits
		};
	const limit = report.limits[bucket];
	const left = Math.max(limit - report.used[bucket], 0);
	const welcome = report.auth ? (report.welcome ?? 0) : 0;
	if (left > 0) return { kind: 'free', left, limit, welcome };
	return report.auth ? { kind: 'claim', welcome } : { kind: 'out' };
}
