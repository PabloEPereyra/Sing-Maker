import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vitest/config';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { D1Like } from './src/lib/server/db';

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
/** Encabezados de la conexión, que no pasan al Request de la función. */
const HOP = new Set(['host', 'connection', 'content-length', 'transfer-encoding', 'keep-alive']);

function devFunctions(): Plugin {
	// Con DEV_DB en .dev.vars (p. ej. .wrangler/dev.sqlite), una base local hace de D1: cupos, cuentas y créditos.
	// Se carga recién al usarla, para que el build no dependa de node:sqlite.
	let db: D1Like | undefined;
	const devDb = async (): Promise<D1Like | undefined> => {
		const path = readDevVars().DEV_DB;
		if (!path) return undefined;
		if (!db) {
			mkdirSync(dirname(path), { recursive: true });
			const { sqliteD1 } = await import('./scripts/d1-sqlite');
			db = sqliteD1(path);
		}
		return db;
	};
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
						request: new Request(new URL(url.pathname, `http://${req.headers.host}`), {
							method: 'POST',
							// Todos los encabezados (cookie, identificación, firma de webhooks) menos los de la conexión.
							headers: Object.entries(req.headers).flatMap(([k, v]) =>
								typeof v === 'string' && !HOP.has(k) ? [[k, v] as [string, string]] : []
							),
							body: Buffer.concat(chunks)
						}),
						env: { ...readDevVars(), DB: await devDb() }
					});
					res.statusCode = response.status;
					response.headers.forEach((v, k) => {
						if (k !== 'set-cookie') res.setHeader(k, v);
					});
					const cookies = response.headers.getSetCookie();
					if (cookies.length) res.setHeader('Set-Cookie', cookies);
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
