// POST /api/character-job — precio fijo de crear o retocar un personaje u objeto (ver src/lib/server/jobs.ts).
//   { action: 'start', kind }          cobra y devuelve { job, price }; `job: null` si no hay cuentas (se cuenta
//                                      cada imagen, como siempre)
//   { action: 'settle', job, outcome } cierra el trabajo y devuelve { refunded }
import { z } from 'zod';
import { JOB_KINDS } from '../../src/lib/pricing';
import { closeJob, openJob, type FunctionEnv } from '../../src/lib/server/quota';
import { json } from '../../src/lib/server/respond';

const Body = z.discriminatedUnion('action', [
	z.object({ action: z.literal('start'), kind: z.enum(JOB_KINDS) }),
	z.object({
		action: z.literal('settle'),
		job: z.string().max(64),
		outcome: z.enum(['done', 'cancelled', 'failed'])
	})
]);

export async function onRequestPost({
	request,
	env
}: {
	request: Request;
	env: FunctionEnv;
}): Promise<Response> {
	const parsed = Body.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ error: 'Invalid request.' }, 400);
	const body = parsed.data;
	if (body.action === 'start') {
		const r = await openJob(request, env, body.kind);
		if (!r.ok) return json({ error: r.error, bucket: r.bucket }, r.status);
		return json({ job: r.job, price: r.price });
	}
	const r = await closeJob(request, env, body.job, body.outcome);
	if (!r.ok) return json({ error: r.error }, r.status);
	return json({ refunded: r.refunded });
}
