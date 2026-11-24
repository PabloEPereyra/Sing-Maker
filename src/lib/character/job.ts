// Precio fijo de crear o retocar (src/lib/server/jobs.ts): se cobra antes de empezar, las imágenes del proceso van
// incluidas y, si falla o se cancela, el servidor devuelve lo que corresponda.
import { characterApi } from '$lib/ai/characterClient';
import type { JobKind } from '$lib/pricing';

export interface JobRun {
	kind: JobKind;
	signal?: AbortSignal;
	/** Cuántos créditos se devolvieron (solo si fueron más de 0). */
	onRefund?: (credits: number) => void;
}

/** Cobra, corre `work` con el id del trabajo (`undefined` si el sitio no cobra así) y lo cierra. */
export async function withJob<T>(
	{ kind, signal, onRefund }: JobRun,
	work: (job: string | undefined) => Promise<T>
): Promise<T> {
	// Sin `signal`: si se cancela mientras se cobra, hay que enterarse del id para devolver.
	const job = await characterApi.startJob(kind);
	const settle = async (outcome: 'done' | 'cancelled' | 'failed') => {
		if (!job) return;
		try {
			const refunded = await characterApi.settleJob(job, outcome);
			if (refunded > 0) onRefund?.(refunded);
		} catch {
			// Sin conexión: el servidor lo cierra solo cuando vence y devuelve lo que no se usó.
		}
	};
	try {
		if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
		const result = await work(job ?? undefined);
		await settle(signal?.aborted ? 'cancelled' : 'done');
		return result;
	} catch (e) {
		await settle(signal?.aborted ? 'cancelled' : 'failed');
		throw e;
	}
}
