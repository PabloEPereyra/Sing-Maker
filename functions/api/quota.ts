// POST /api/quota — Cloudflare Pages Function. Dice quién es la persona del código de acceso (encabezado
// X-Access-Code) y cuánto lleva gastado de cada cupo; sin códigos configurados responde {open: true}.
import { usageFor, type FunctionEnv } from '../../src/lib/server/quota';

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
	});
}

export async function onRequestPost({
	request,
	env
}: {
	request: Request;
	env: FunctionEnv;
}): Promise<Response> {
	const report = await usageFor(request, env);
	if ('ok' in report) return json({ error: report.error }, report.status);
	return json(report);
}
