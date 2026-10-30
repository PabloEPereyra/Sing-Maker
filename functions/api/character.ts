// POST /api/character — Cloudflare Pages Function del creador de personajes. Un solo endpoint con varias
// acciones (cada llamada tarda segundos y el navegador las encadena): brief, objects, hero, strip, segment.
// La clave de Meta vive en el servidor.
import {
	CharacterRequestSchema,
	detectFacing,
	detectGround,
	generateImage,
	heroEditPrompt,
	heroPrompt,
	listObjects,
	makeBrief,
	scenePrompt,
	refineBrief,
	mediaConfigFromEnv,
	segmentImage,
	SIZE,
	sizeFor,
	stripPrompt
} from '../../src/lib/ai/character';
import { configFromEnv, GenerateError } from '../../src/lib/ai/generate';
import { charge, refund, type Bucket, type FunctionEnv } from '../../src/lib/server/quota';

type Env = FunctionEnv;

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
	env: Env;
}): Promise<Response> {
	let input;
	try {
		input = CharacterRequestSchema.parse(await request.json());
	} catch {
		return json({ error: 'Invalid request.' }, 400);
	}
	// Las imágenes (personaje, tiras, fondos) son lo que más cuesta: tienen su propio cupo.
	const bucket: Bucket =
		input.action === 'hero' || input.action === 'strip' || input.action === 'scene'
			? 'images'
			: 'other';
	const gate = await charge(request, env, bucket);
	if (!gate.ok) return json({ error: gate.error, bucket: gate.bucket }, gate.status);
	const config = configFromEnv(env);
	const media = mediaConfigFromEnv(env, config);
	try {
		switch (input.action) {
			case 'brief':
				return json(await makeBrief(input, config));
			case 'objects':
				return json({ objects: await listObjects(input, config) });
			case 'hero':
				return json({
					image: await generateImage(
						input.reference && (input.change || input.restyle)
							? heroEditPrompt(input.visual, input.style, input.change ?? '', input.restyle)
							: heroPrompt(input.visual, input.style, input.asset),
						media,
						{ size: SIZE.hero, reference: input.reference }
					)
				});
			case 'refine':
				return json(await refineBrief(input, config));
			case 'strip':
				return json({
					image: await generateImage(
						stripPrompt(input.kind, input.visual, input.style, input.movement, input.flight),
						media,
						{ size: sizeFor(input.kind), reference: input.reference }
					)
				});
			case 'scene':
				return json({
					image: await generateImage(
						scenePrompt(input.visual, input.style, input.movement),
						media,
						{ size: SIZE.scene }
					)
				});
			case 'ground':
				return json({ ground: await detectGround(input.image, config) });
			case 'facing':
				return json({ facing: await detectFacing(input.image, config) });
			case 'segment':
				return json({ text: await segmentImage(input.image, input.noun, media) });
		}
	} catch (e) {
		if (e instanceof GenerateError && e.status < 500)
			return json({ error: e.message, details: e.details }, e.status);
		await refund(env, gate.user, bucket);
		if (e instanceof GenerateError) return json({ error: e.message, details: e.details }, e.status);
		return json({ error: 'Unexpected error.' }, 500);
	}
}
