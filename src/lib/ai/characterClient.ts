// Cliente del navegador para /api/character (la clave de Meta nunca pasa por acá).
import type { Movement, StripKind, StyleId } from '../character/spec';
import type { Brief } from './character';
import { GenerateRequestError } from './client';

async function call<T>(body: Record<string, unknown>): Promise<T> {
	const res = await fetch('/api/character', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok)
		throw new GenerateRequestError(data.error ?? `HTTP ${res.status}`, data.details ?? []);
	return data as T;
}

export const characterApi = {
	brief: (prompt: string, lang: 'es' | 'en', image?: string) =>
		call<Brief>({ action: 'brief', prompt, lang, image }),
	objects: (image: string, lang: 'es' | 'en') =>
		call<{ objects: { noun: string; label: string }[] }>({ action: 'objects', image, lang }).then(
			(r) => r.objects
		),
	hero: (visual: string, style: StyleId, movement: Movement) =>
		call<{ image: string }>({ action: 'hero', visual, style, movement }).then((r) => r.image),
	strip: (
		kind: StripKind,
		visual: string,
		style: StyleId,
		movement: Movement,
		reference: string,
		flight?: string
	) =>
		call<{ image: string }>({
			action: 'strip',
			kind,
			visual,
			style,
			movement,
			reference,
			flight
		}).then((r) => r.image),
	segment: (image: string, noun: string) =>
		call<{ text: string }>({ action: 'segment', image, noun }).then((r) => r.text)
};
