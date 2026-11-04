// Cliente del navegador para /api/character (la clave de Meta nunca pasa por acá).
import type { Movement, StripKind, StyleId } from '../character/spec';
import type { Brief, BriefTurn, GroundInfo, Refined } from './character';
import { t } from '../i18n';
import { GenerateRequestError } from './client';
import { postJson } from './http';

/** El filtro de contenido de la IA bloqueó la imagen (a veces con frases inocentes de la descripción). */
export class ContentBlockedError extends GenerateRequestError {}

/** `signal` cancela el pedido en curso (el botón "Cancelar" del creador). */
async function call<T>(body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
	const { res, data } = await postJson<T>('/api/character', body, signal);
	// 422: el filtro de contenido de la IA bloqueó la imagen (también tras reintentar)
	if (res.status === 422) throw new ContentBlockedError(t('char.blocked'));
	if (!res.ok)
		throw new GenerateRequestError(data.error ?? `HTTP ${res.status}`, data.details ?? []);
	return data as T;
}

export const characterApi = {
	brief: (
		prompt: string,
		lang: 'es' | 'en',
		image?: string,
		kind: 'character' | 'item' | 'scene' = 'character',
		thread: BriefTurn[] = [],
		signal?: AbortSignal
	) => call<Brief>({ action: 'brief', prompt, lang, image, kind, thread }, signal),
	scene: (
		visual: string,
		style: StyleId,
		movement: Movement,
		/** Retoque: el fondo actual y el cambio pedido (`visual` va vacío). */
		edit?: { reference: string; change: string },
		signal?: AbortSignal
	) =>
		call<{ image: string }>({ action: 'scene', visual, style, movement, ...edit }, signal).then(
			(r) => r.image
		),
	ground: (image: string) => call<GroundInfo>({ action: 'ground', image }),
	objects: (image: string, lang: 'es' | 'en') =>
		call<{ objects: { noun: string; label: string }[] }>({ action: 'objects', image, lang }).then(
			(r) => r.objects
		),
	hero: (
		visual: string,
		style: StyleId,
		movement: Movement,
		opts: {
			reference?: string;
			change?: string;
			restyle?: boolean;
			asset?: 'character' | 'item';
		} = {},
		signal?: AbortSignal
	) =>
		call<{ image: string }>({ action: 'hero', visual, style, movement, ...opts }, signal).then(
			(r) => r.image
		),
	refine: (
		visual: string,
		noun: string,
		flight: string,
		instruction: string,
		lang: 'es' | 'en',
		signal?: AbortSignal
	) => call<Refined>({ action: 'refine', visual, noun, flight, instruction, lang }, signal),
	strip: (
		kind: StripKind,
		visual: string,
		style: StyleId,
		movement: Movement,
		reference: string,
		flight?: string,
		fix?: string,
		signal?: AbortSignal
	) =>
		call<{ image: string }>(
			{ action: 'strip', kind, visual, style, movement, reference, flight, fix },
			signal
		).then((r) => r.image),
	/** Muse Wonder revisa la hoja de poses; `ok: false` trae qué corregir al volver a dibujarla. */
	review: (
		kind: StripKind,
		image: string,
		reference?: string,
		signal?: AbortSignal,
		flight?: string
	) =>
		call<{ ok: boolean; problems: string[] }>(
			{ action: 'review', kind, image, reference, flight },
			signal
		),
	facing: (image: string, signal?: AbortSignal) =>
		call<{ facing: 'left' | 'right' | 'front' | 'unclear' }>(
			{ action: 'facing', image },
			signal
		).then((r) => r.facing),
	segment: (image: string, noun: string, signal?: AbortSignal) =>
		call<{ text: string }>({ action: 'segment', image, noun }, signal).then((r) => r.text)
};
