import { describe, expect, it } from 'vitest';
import {
	charge,
	DEFAULT_LIMITS,
	limitsFromEnv,
	parseCodes,
	refund,
	usageFor,
	type D1Like,
	type QuotaEnv
} from '../src/lib/server/quota';

/** D1 en memoria: solo las tres consultas que usa el módulo. */
function fakeDb(): D1Like & { rows: Map<string, number> } {
	const rows = new Map<string, number>();
	const key = (name: unknown, bucket: unknown) => `${name}|${bucket}`;
	return {
		rows,
		prepare(sql: string) {
			const run = async () => ({ meta: { changes: 0 } });
			return {
				run,
				bind: (...v: unknown[]) => ({
					run: async () => {
						if (sql.startsWith('INSERT')) {
							const k = key(v[0], v[1]);
							const n = rows.get(k);
							if (n === undefined) rows.set(k, 1);
							else if (n < Number(v[2])) rows.set(k, n + 1);
							else return { meta: { changes: 0 } };
							return { meta: { changes: 1 } };
						}
						if (sql.startsWith('UPDATE')) {
							const k = key(v[0], v[1]);
							rows.set(k, Math.max((rows.get(k) ?? 0) - 1, 0));
						}
						return { meta: { changes: 1 } };
					},
					all: async <T>() => ({
						results: [...rows.entries()]
							.filter(([k]) => k.startsWith(`${v[0]}|`))
							.map(([k, n]) => ({ bucket: k.split('|')[1], n })) as T[]
					})
				})
			};
		}
	};
}

const req = (code?: string) =>
	new Request('https://x.test/api/generate', {
		method: 'POST',
		headers: code ? { 'X-Access-Code': code } : {}
	});

describe('códigos y límites', () => {
	it('lee «nombre=código» separados por coma, punto y coma o salto de línea', () => {
		const codes = parseCodes('ana=K3f9, beto = Pq82 ;solo\n=vacio,x=');
		expect([...codes]).toEqual([
			['K3f9', 'ana'],
			['Pq82', 'beto'],
			['solo', 'solo']
		]);
	});

	it('los límites tienen valores por defecto y se pueden cambiar', () => {
		expect(limitsFromEnv({})).toEqual(DEFAULT_LIMITS);
		expect(DEFAULT_LIMITS).toEqual({ exercises: 200, characters: 40, images: 300, other: 3000 });
		expect(limitsFromEnv({ LIMIT_EXERCISES: '10', LIMIT_IMAGES: '0', LIMIT_OTHER: 'x' })).toEqual({
			exercises: 10,
			characters: 40,
			images: 0,
			other: 3000
		});
	});
});

describe('cupos por persona', () => {
	const base = (db?: D1Like): QuotaEnv => ({ ACCESS_CODES: 'ana=K3f9,beto=Pq82', DB: db });

	it('sin códigos configurados el acceso es libre', async () => {
		expect(await charge(req(), {}, 'exercises')).toEqual({ ok: true, user: null });
	});

	it('sin código o con uno inválido responde 401', async () => {
		const env = base(fakeDb());
		expect(await charge(req(), env, 'exercises')).toMatchObject({
			ok: false,
			status: 401,
			error: 'access_code_required'
		});
		expect(await charge(req('nope'), env, 'exercises')).toMatchObject({
			ok: false,
			status: 401,
			error: 'invalid_access_code'
		});
	});

	it('cuenta por persona y tipo, y corta al llegar al tope', async () => {
		const db = fakeDb();
		const env = { ...base(db), LIMIT_EXERCISES: '2' };
		expect(await charge(req('K3f9'), env, 'exercises')).toEqual({ ok: true, user: 'ana' });
		expect(await charge(req('K3f9'), env, 'exercises')).toEqual({ ok: true, user: 'ana' });
		expect(await charge(req('K3f9'), env, 'exercises')).toEqual({
			ok: false,
			status: 429,
			error: 'quota_exceeded',
			bucket: 'exercises'
		});
		// otra persona y otro tipo de cupo no se ven afectados
		expect(await charge(req('Pq82'), env, 'exercises')).toEqual({ ok: true, user: 'beto' });
		expect(await charge(req('K3f9'), env, 'images')).toEqual({ ok: true, user: 'ana' });
		expect(db.rows.get('ana|exercises')).toBe(2);
	});

	it('con límite 0 no deja pasar nada', async () => {
		const env = { ...base(fakeDb()), LIMIT_IMAGES: '0' };
		expect(await charge(req('K3f9'), env, 'images')).toMatchObject({ ok: false, status: 429 });
	});

	it('sin base de datos falla cerrado', async () => {
		expect(await charge(req('K3f9'), base(), 'exercises')).toMatchObject({
			ok: false,
			status: 500,
			error: 'quota_unavailable'
		});
	});

	it('devuelve una llamada si el servidor falló', async () => {
		const db = fakeDb();
		const env = base(db);
		await charge(req('K3f9'), env, 'exercises');
		await refund(env, 'ana', 'exercises');
		expect(db.rows.get('ana|exercises')).toBe(0);
		await refund(env, 'ana', 'exercises');
		expect(db.rows.get('ana|exercises')).toBe(0);
	});

	it('informa el consumo y los límites de quien manda el código', async () => {
		const env = base(fakeDb());
		await charge(req('K3f9'), env, 'exercises');
		await charge(req('K3f9'), env, 'images');
		await charge(req('K3f9'), env, 'images');
		expect(await usageFor(req('K3f9'), env)).toEqual({
			open: false,
			codes: true,
			name: 'ana',
			used: { exercises: 1, characters: 0, images: 2, other: 0 },
			limits: DEFAULT_LIMITS
		});
		expect(await usageFor(req(), {})).toEqual({ open: true });
		expect(await usageFor(req('x'), env)).toMatchObject({ ok: false, status: 401 });
	});
});

describe('cupos por dispositivo (sin códigos)', () => {
	const ID = 'a1b2c3d4-e5f6-4789-abcd-0123456789ab';
	const dev = (id?: string) =>
		new Request('https://x.test/api/generate', {
			method: 'POST',
			headers: id ? { 'X-Client-Id': id } : {}
		});

	it('sin códigos ni base de datos el acceso es libre', async () => {
		expect(await charge(dev(ID), {}, 'exercises')).toEqual({ ok: true, user: null });
	});

	it('con base de datos cuenta por identificador y corta en el tope', async () => {
		const db = fakeDb();
		const env: QuotaEnv = { DB: db, LIMIT_EXERCISES: '2' };
		const user = `device:${ID}`;
		expect(await charge(dev(ID), env, 'exercises')).toEqual({ ok: true, user });
		expect(await charge(dev(ID), env, 'exercises')).toEqual({ ok: true, user });
		expect(await charge(dev(ID), env, 'exercises')).toMatchObject({ ok: false, status: 429 });
		expect(await charge(dev('zzzzzzzz-other-device-id'), env, 'exercises')).toMatchObject({
			ok: true
		});
	});

	it('pide el identificador y rechaza uno mal formado', async () => {
		const env: QuotaEnv = { DB: fakeDb() };
		expect(await charge(dev(), env, 'exercises')).toMatchObject({
			ok: false,
			status: 400,
			error: 'client_id_required'
		});
		expect(await charge(dev('corto'), env, 'exercises')).toMatchObject({ status: 400 });
		expect(await charge(dev('con espacios y símbolos!!'), env, 'exercises')).toMatchObject({
			status: 400
		});
	});

	it('el personaje cuenta aparte de las imágenes y informa que no hay códigos', async () => {
		const env: QuotaEnv = { DB: fakeDb(), LIMIT_CHARACTERS: '1' };
		await charge(dev(ID), env, 'characters');
		expect(await charge(dev(ID), env, 'characters')).toMatchObject({
			status: 429,
			bucket: 'characters'
		});
		expect(await charge(dev(ID), env, 'images')).toMatchObject({ ok: true });
		expect(await usageFor(dev(ID), env)).toMatchObject({
			open: false,
			codes: false,
			used: { exercises: 0, characters: 1, images: 1, other: 0 }
		});
	});
});
