import { describe, expect, it } from 'vitest';
import { generateImage } from '../src/lib/ai/character';

const media = { apiKey: 'k', baseUrl: 'https://x', imageModel: 'm', segmentModel: 's' };
const blocked = () =>
	new Response(
		JSON.stringify({
			error: {
				message:
					'The response was filtered due to the prompt triggering our content management policy.'
			}
		}),
		{ status: 400 }
	);
const ok = () =>
	new Response(JSON.stringify({ data: [{ b64_json: 'AAAA' }], output_format: 'webp' }), {
		status: 200
	});

function fetchSequence(...answers: (() => Response)[]) {
	let calls = 0;
	const impl = (async () => answers[Math.min(calls++, answers.length - 1)]()) as typeof fetch;
	return { impl, calls: () => calls };
}

describe('generateImage y el filtro de contenido', () => {
	it('reintenta cuando el filtro bloquea y devuelve la imagen si después pasa', async () => {
		const f = fetchSequence(blocked, ok);
		const img = await generateImage('p', media, { size: '1024x1024' }, f.impl);
		expect(img).toBe('data:image/webp;base64,AAAA');
		expect(f.calls()).toBe(2);
	});

	it('se rinde tras los reintentos con un error 422', async () => {
		const f = fetchSequence(blocked);
		await expect(generateImage('p', media, { size: '1024x1024' }, f.impl)).rejects.toMatchObject({
			status: 422
		});
		expect(f.calls()).toBe(3);
	});

	it('no reintenta otros errores', async () => {
		const f = fetchSequence(() => new Response('{}', { status: 500 }));
		await expect(generateImage('p', media, { size: '1024x1024' }, f.impl)).rejects.toMatchObject({
			status: 502
		});
		expect(f.calls()).toBe(1);
	});
});
