<script lang="ts">
	// "Crear fondo con IA": Spark interpreta el lugar, Muse Image pinta un fondo ancho que se repite al avanzar y,
	// para los que caminan, Spark mira la imagen y dice dónde empieza el suelo (se puede ajustar con el deslizador).
	import { onDestroy } from 'svelte';
	import type { Brief, BriefTurn } from '$lib/ai/character';
	import { characterApi } from '$lib/ai/characterClient';
	import ClarifyChat from './ClarifyChat.svelte';
	import { GenerateRequestError } from '$lib/ai/client';
	import { addScene, assets, MAX_SCENES } from '$lib/character/assets.svelte';
	import { blobToRaster, rasterToJpegUrl } from '$lib/character/create';
	import {
		PLATFORM_STYLES,
		STYLES,
		type Movement,
		type PlatformStyle,
		type StyleId
	} from '$lib/character/spec';
	import { loadImage } from '$lib/game/themes/common';
	import { drawPlatform, samplePalette } from '$lib/game/themes/platform';
	import { t } from '$lib/i18n';
	import { settings } from '$lib/settings.svelte';

	let {
		movement: initialMovement,
		onClose,
		onCreated
	}: { movement: Movement; onClose: () => void; onCreated: () => void } = $props();

	let movement = $derived<Movement>(initialMovement);
	let style = $state<StyleId>('cute3d');
	let prompt = $state('');
	let name = $state('');

	type Phase = 'form' | 'working' | 'review';
	let phase = $state<Phase>('form');
	let error = $state('');
	let note = $state<{ kind: 'clarify' | 'refuse'; text: string } | null>(null);
	/** Preguntas de la IA ya respondidas en el chat (ver ClarifyChat). */
	let thread = $state<BriefTurn[]>([]);
	let image = $state.raw<Blob | null>(null);
	let imageUrl = $state('');
	let ground = $state(0.8);
	/** Forma de las plataformas (la propone Spark al mirar el fondo; se puede cambiar). */
	let platform = $state<PlatformStyle>('log');
	let preview = $state<HTMLCanvasElement>();
	let saving = $state(false);
	let disposed = false;
	onDestroy(() => {
		disposed = true;
		if (imageUrl) URL.revokeObjectURL(imageUrl);
	});

	const full = $derived(assets.scenes.length >= MAX_SCENES);
	const canCreate = $derived(!full && prompt.trim().length > 0 && phase === 'form');

	/** Respuesta a la pregunta de la IA: sigue la conversación y vuelve a pedir lo mismo. */
	async function reply(text: string) {
		if (note?.kind !== 'clarify') return;
		thread = [...thread, { q: note.text, a: text }];
		await create();
	}

	async function create() {
		if (!canCreate) return;
		error = '';
		note = null;
		phase = 'working';
		try {
			const brief: Brief = await characterApi.brief(
				prompt.trim(),
				settings.lang,
				undefined,
				'scene',
				thread
			);
			if (disposed) return;
			if (brief.status !== 'ok') {
				note = { kind: brief.status, text: brief.message };
				phase = 'form';
				return;
			}
			thread = [];
			name = brief.name;
			const dataUrl = await characterApi.scene(brief.visual, style, movement);
			const blob = await (await fetch(dataUrl)).blob();
			if (disposed) return;
			if (movement === 'walk') {
				// Spark mira el fondo y dice en qué fracción del alto empieza el suelo (si falla, un valor razonable).
				try {
					const small = rasterToJpegUrl(await blobToRaster(blob, 800), 0.8);
					const info = await characterApi.ground(small);
					ground = info.ground;
					platform = info.platform;
				} catch {
					ground = 0.8;
					platform = 'log';
				}
			} else ground = 0.865;
			if (disposed) return;
			if (imageUrl) URL.revokeObjectURL(imageUrl);
			image = blob;
			imageUrl = URL.createObjectURL(blob);
			phase = 'review';
		} catch (e) {
			if (disposed) return;
			error = e instanceof Error ? e.message : t('char.error');
			if (e instanceof GenerateRequestError && e.details.length)
				error += ` (${e.details.join('; ')})`;
			phase = 'form';
		}
	}

	async function save() {
		if (!image || saving) return;
		saving = true;
		try {
			const rec = await addScene({
				name: name.trim() || t('scene.defaultName'),
				movement,
				image,
				ground,
				platform: movement === 'walk' ? platform : undefined
			});
			if (movement === 'walk') settings.backgroundWalk = rec.id;
			else settings.backgroundFly = rec.id;
			onCreated();
		} catch (e) {
			error = e instanceof Error ? e.message : t('char.error');
		} finally {
			saving = false;
		}
	}

	// Vista previa de las plataformas sobre el fondo, con los colores que sacaría el juego.
	$effect(() => {
		if (phase !== 'review' || movement !== 'walk' || !preview || !imageUrl) return;
		const canvas = preview;
		const style = platform;
		const groundAt = ground;
		let cancelled = false;
		loadImage(imageUrl).then((img) => {
			const g = canvas.getContext('2d');
			if (cancelled || !g) return;
			// Se ve la franja de abajo del fondo: el suelo y un poco del paisaje de arriba.
			const from = Math.max(0, groundAt - 0.42);
			const to = Math.min(1, groundAt + 0.08);
			const sy = from * img.height;
			g.drawImage(
				img,
				0,
				sy,
				img.width,
				(to - from) * img.height,
				0,
				0,
				canvas.width,
				canvas.height
			);
			const line = ((groundAt - from) / (to - from)) * canvas.height;
			const pal = samplePalette(img, groundAt);
			for (const [x, w, lift] of [
				[36, 120, 34],
				[190, 90, 66],
				[330, 130, 40]
			])
				drawPlatform(g, style, x, line - lift, w, 11, pal, false);
		});
		return () => (cancelled = true);
	});

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && phase !== 'working') onClose();
	}

	const STYLE_KEYS = {
		cute3d: 'char.style.cute3d',
		cartoon: 'char.style.cartoon',
		anime: 'char.style.anime',
		ligneclaire: 'char.style.ligneclaire',
		comic: 'char.style.comic',
		clay: 'char.style.clay',
		flatvector: 'char.style.flatvector',
		pixel: 'char.style.pixel',
		watercolor: 'char.style.watercolor'
	} as const;
</script>

<svelte:window onkeydown={onKey} />

<div
	class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
	role="presentation"
	onclick={(e) => e.target === e.currentTarget && phase !== 'working' && onClose()}
>
	<div
		class="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-surface p-5 shadow-xl"
		role="dialog"
		aria-modal="true"
		aria-labelledby="scene-title"
	>
		<div class="flex items-center justify-between">
			<h3 id="scene-title" class="text-lg font-bold">✨ {t('scene.title')}</h3>
			<button
				class="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 disabled:opacity-40"
				aria-label={t('range.close')}
				disabled={phase === 'working'}
				onclick={onClose}>✕</button
			>
		</div>

		{#if phase === 'form'}
			<p class="mt-1 text-sm text-muted">{t('scene.intro')}</p>

			<div class="mt-4 flex gap-2" role="radiogroup" aria-label={t('scene.type')}>
				{#each [['walk', 'character.walker'], ['fly', 'character.flyerPick']] as const as [m, label] (m)}
					<button
						class="flex-1 rounded-lg border-2 px-3 py-2 text-sm font-semibold transition {movement ===
						m
							? 'border-accent bg-accent/10'
							: 'border-border hover:border-accent/50'}"
						role="radio"
						aria-checked={movement === m}
						onclick={() => (movement = m)}>{t(label)}</button
					>
				{/each}
			</div>
			<p class="mt-1 text-xs text-muted">
				{movement === 'walk' ? t('scene.walkHelp') : t('scene.flyHelp')}
			</p>

			<textarea
				bind:value={prompt}
				oninput={() => {
					thread = [];
					if (note?.kind === 'clarify') note = null;
				}}
				rows="3"
				maxlength="600"
				placeholder={t('scene.placeholder')}
				class="mt-3 w-full resize-none rounded-lg border border-border bg-base px-3 py-2 text-sm outline-none focus:border-accent"
			></textarea>
			<div class="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('char.style')}>
				{#each STYLES as s (s)}
					<button
						class="rounded-lg border px-2.5 py-1 text-xs font-semibold transition {style === s
							? 'border-accent bg-accent text-white'
							: 'border-border bg-surface-2 hover:border-accent/50'}"
						role="radio"
						aria-checked={style === s}
						onclick={() => (style = s)}>{t(STYLE_KEYS[s])}</button
					>
				{/each}
			</div>

			{#if note?.kind === 'clarify'}
				<ClarifyChat {thread} question={note.text || t('char.clarify')} onReply={reply} />
			{:else if note}
				<div
					role="alert"
					class="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
				>
					{note.text || t('char.refused')}
				</div>
			{/if}
			{#if error}
				<p
					role="alert"
					class="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
				>
					{error}
				</p>
			{/if}
			{#if full}<p class="mt-3 text-sm text-red-700">{t('scene.full', { n: MAX_SCENES })}</p>{/if}

			<div class="mt-4 flex items-center justify-between gap-3">
				<span class="text-xs text-muted">{t('char.time')}</span>
				<button
					class="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
					disabled={!canCreate}
					onclick={create}>{t('scene.create')}</button
				>
			</div>
		{:else if phase === 'working'}
			<div
				class="mt-6 mb-4 flex items-center justify-center gap-3 text-sm text-muted"
				role="status"
			>
				<svg
					class="h-6 w-6 animate-spin text-accent"
					style:animation-timing-function="steps(8, end)"
					style:animation-duration="1s"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2.4"
					stroke-linecap="round"
					aria-hidden="true"
				>
					<path d="M12 3v5" />
					<path d="M18.4 5.6 15 9" opacity="0.9" />
					<path d="M21 12h-5" opacity="0.8" />
					<path d="M18.4 18.4 15 15" opacity="0.7" />
					<path d="M12 21v-5" opacity="0.6" />
					<path d="M5.6 18.4 9 15" opacity="0.5" />
					<path d="M3 12h5" opacity="0.4" />
					<path d="M5.6 5.6 9 9" opacity="0.3" />
				</svg>
				{t('scene.working')}
			</div>
			<p class="text-center text-xs text-muted">{t('char.keepOpen')}</p>
		{:else}
			{#if movement === 'walk'}<p class="mt-1 text-sm text-muted">{t('scene.review')}</p>{/if}
			<div class="relative mt-3 overflow-hidden rounded-lg border border-border">
				<img src={imageUrl} alt="" class="block aspect-video w-full object-cover" />
				{#if movement === 'walk'}
					<!-- La línea marca por dónde camina el personaje -->
					<div
						class="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-white/90 shadow-[0_1px_0_rgba(0,0,0,0.4)]"
						style:top="{ground * 100}%"
					></div>
				{/if}
			</div>
			{#if movement === 'walk'}
				<label class="mt-3 block">
					<span class="mb-1 flex justify-between text-xs text-muted">
						<span>{t('scene.ground')}</span>
						<span class="font-semibold tabular-nums">{Math.round(ground * 100)} %</span>
					</span>
					<input
						type="range"
						min="0.5"
						max="0.95"
						step="0.005"
						bind:value={ground}
						class="vx-slider w-full"
						style:--fill="{((ground - 0.5) / 0.45) * 100}%"
					/>
				</label>
				<div class="mt-3">
					<span class="mb-1 block text-xs text-muted">{t('scene.platform')}</span>
					<canvas
						bind:this={preview}
						width="480"
						height="135"
						class="block w-full rounded-lg border border-border"
						aria-hidden="true"
					></canvas>
					<div
						class="mt-2 flex flex-wrap gap-1.5"
						role="radiogroup"
						aria-label={t('scene.platform')}
					>
						{#each PLATFORM_STYLES as p (p)}
							<button
								class="rounded-lg border px-2.5 py-1 text-xs font-semibold transition {platform ===
								p
									? 'border-accent bg-accent text-white'
									: 'border-border bg-surface-2 hover:border-accent/50'}"
								role="radio"
								aria-checked={platform === p}
								onclick={() => (platform = p)}>{t(`platform.${p}`)}</button
							>
						{/each}
					</div>
				</div>
			{/if}
			<label class="mt-4 block text-sm">
				<span class="mb-1 block text-xs text-muted">{t('char.name')}</span>
				<input
					bind:value={name}
					maxlength="30"
					class="w-full rounded-lg border border-border bg-base px-3 py-1.5 outline-none focus:border-accent"
				/>
			</label>
			{#if error}<p role="alert" class="mt-3 text-sm text-red-700">{error}</p>{/if}
			<div class="mt-4 flex justify-end gap-2">
				<button
					class="rounded-lg border border-border bg-surface px-4 py-2 text-sm hover:bg-surface-2"
					onclick={() => {
						image = null;
						phase = 'form';
					}}>{t('char.again')}</button
				>
				<button
					class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
					disabled={saving}
					onclick={save}>{t('scene.save')}</button
				>
			</div>
		{/if}
	</div>
</div>
