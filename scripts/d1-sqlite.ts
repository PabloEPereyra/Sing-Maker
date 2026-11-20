// D1 sobre el SQLite que trae Node (node:sqlite), con la misma interfaz mínima que usa el servidor
// (src/lib/server/db.ts). Sirve para el modo desarrollo (DEV_DB en .dev.vars) y para los tests.
// No se usa en Cloudflare: allá DB es la base D1 de verdad.
import { DatabaseSync } from 'node:sqlite';
import type { D1Bound, D1Like } from '../src/lib/server/db';

export function sqliteD1(path = ':memory:'): D1Like & { raw: DatabaseSync } {
	const raw = new DatabaseSync(path);
	const bound = (sql: string, values: unknown[]): D1Bound => {
		const params = values as (string | number | null)[];
		return {
			run: async () => ({ meta: { changes: Number(raw.prepare(sql).run(...params).changes) } }),
			all: async <T>() => ({ results: raw.prepare(sql).all(...params) as T[] }),
			first: async <T>() => (raw.prepare(sql).get(...params) as T | undefined) ?? null
		};
	};
	return {
		raw,
		prepare: (sql: string) => ({
			bind: (...values: unknown[]) => bound(sql, values),
			run: async () => raw.prepare(sql).run()
		}),
		async batch(statements: D1Bound[]) {
			raw.exec('BEGIN');
			try {
				const out = [];
				for (const s of statements) out.push(await s.run());
				raw.exec('COMMIT');
				return out;
			} catch (e) {
				raw.exec('ROLLBACK');
				throw e;
			}
		}
	};
}
