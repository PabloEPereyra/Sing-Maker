import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vitest/config';
import { existsSync, readFileSync } from 'node:fs';

/** Lee .dev.vars (formato de wrangler: CLAVE=valor por línea). Nunca se sube al repo. */
function readDevVars(): Record<string, string> {
	if (!existsSync('.dev.vars')) return {};
	const vars: Record<string, string> = {};
	for (const line of readFileSync('.dev.vars', 'utf8').split(/\r?\n/)) {
		const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
		if (m) vars[m[1]] = m[2].replace(/^["']|["']$/g, '');
	}
	return vars;
}

/**
 * En desarrollo, sirve las Pages Functions de functions/api/*.ts con el mismo código que en
 * Cloudflare (el sitio es estático; en producción las corre Cloudflare).
 */
function devFunctions(): Plugin {
	return {
		name: 'singmaker-dev-functions',
		apply: 'serve',
		configureServer(server) {
			server.middlewares.use(async (req, res, next) => {
				const url = new URL(req.url ?? '/', 'http://localhost');
				// /api/<nombre> -> functions/api/<nombre>.ts (generate, transcribe…)
				const name = url.pathname.match(/^\/api\/([a-z-]+)$/)?.[1];
				if (!name || req.method !== 'POST' || !existsSync(`functions/api/${name}.ts`))
					return next();
				try {
					const chunks: Buffer[] = [];
					for await (const c of req) chunks.push(c as Buffer);
					const mod = await server.ssrLoadModule(`/functions/api/${name}.ts`);
					const response: Response = await mod.onRequestPost({
						request: new Request(url, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: Buffer.concat(chunks)
						}),
						env: { ...readDevVars() }
					});
					res.statusCode = response.status;
					response.headers.forEach((v, k) => res.setHeader(k, v));
					res.end(await response.text());
				} catch (e) {
					next(e);
				}
			});
		}
	};
}

export default defineConfig({
	plugins: [tailwindcss(), sveltekit(), devFunctions()],
	build: { target: 'es2022' },
	test: { include: ['src/**/*.test.ts', 'tests/**/*.test.ts'] }
});
