<script lang="ts">
	// "Crear objeto para recoger con IA": lo que se junta al cantar (una moneda, una fruta, una gema…).
	// Spark interpreta el pedido y reconoce qué hay en una foto; SAM recorta el objeto elegido; Muse Image lo dibuja en
	// tres poses (normal, inclinado y brillante para cuando se recoge). Queda guardado en el dispositivo.
	import { onDestroy } from 'svelte';
	import type { Brief } from '$lib/ai/character';
	import { characterApi } from '$lib/ai/characterClient';
	import { GenerateRequestError } from '$lib/ai/client';
	import { addItem, assets, MAX_ITEMS } from '$lib/character/assets.svelte';
	import {
		blobToRaster,
		createItem,
		cutSubject,
		rasterToCanvas,
		rasterToJpegUrl,
		rasterToPngBlob,
		rasterToPngUrl,
		type StepId,
		type StepState
	} from '$lib/character/create';
	import type { Raster, Strip } from '$lib/character/process';
	import { CharacterError, STYLES, type StyleId } from '$lib/character/spec';
	import { t } from '$lib/i18n';
	import { settings } from '$lib/settings.svelte';

	let { onClose, onCreated }: { onClose: () => void; onCreated: () => void } = $props();

	let style = $state<StyleId>('cute3d');
	let prompt = $state('');
	let name = $state('');

	// Foto opcional
	let photo = $state.raw<Raster | null>(null);
	let photoUrl = $state('');
	let objects = $state<{ noun: string; label: string }[]>([]);
	let looking = $state(false);
	let chosen = $state<{ noun: string; label: string } | null>(null);
	let cutting = $state(false);
	let cutUrl = $state('');
	let reference = $state<string | undefined>();

	type Phase = 'form' | 'working' | 'review';
	let phase = $state<Phase>('form');
	let steps = $state<Record<string, { state: StepState; message?: string }>>({});
	let error = $state('');
	let note = $state<{ kind: 'clarify' | 'refuse'; text: string } | null>(null);
	let strip = $state.raw<Strip | null>(null);
	let saving = $state(false);
	let disposed = false;
	onDestroy(() => (disposed = true));

	const full = $derived(assets.items.length >= MAX_ITEMS);
	const canCreate = $derived(
		!full &&
			(prompt.trim().length > 0 || photo !== null) &&
			phase === 'form' &&
			!looking &&
			!cutting
	);

	function fail(e: unknown) {
		error =
			e instanceof CharacterError
				? e.code === 'refused'
					? e.message
					: t(`char.err.${e.code}` as 'char.err.notFound')
				: e instanceof Error
					? e.message
					: t('char.error');
		if (e instanceof GenerateRequestError && e.details.length)
			error += ` (${e.details.join('; ')})`;
	}

	async function onFile(file: File | undefined) {
		if (!file) return;
		error = '';
		objects = [];
		chosen = null;
		cutUrl = '';
		reference = undefined;
		if (file.size > 12_000_000) {
			error = t('char.photoBig');
			return;
		}
		try {
			photo = await blobToRaster(file, 1200);
			photoUrl = rasterToJpegUrl(photo, 0.85);
		} catch {
			photo = null;
			photoUrl = '';
			error = t('char.photoBad');
			return;
		}
		looking = true;
		try {
			objects = await characterApi.objects(photoUrl, settings.lang);
			if (!objects.length) error = t('char.noObjects');
			else if (objects.length === 1) await pick(objects[0]);
		} catch (e) {
			fail(e);
		} finally {
			looking = false;
		}
	}

	async function pick(o: { noun: string; label: string }) {
		if (!photo || cutting) return;
		chosen = o;
		cutting = true;
		error = '';
		try {
			const cut = await cutSubject(photo, o.noun, false, false);
			cutUrl = rasterToPngUrl(cut.cutout);
			reference = cut.reference;
		} catch (e) {
			chosen = null;
			cutUrl = '';
			reference = undefined;
			fail(e);
		} finally {
			cutting = false;
		}
	}

	function clearPhoto() {
		photo = null;
		photoUrl = '';
		objects = [];
		chosen = null;
		cutUrl = '';
		reference = undefined;
	}

	async function create() {
		if (!canCreate) return;
		error = '';
		note = null;
		steps = { hero: { state: 'working' } };
		phase = 'working';
		try {
			const subject = chosen ? `Subject: ${chosen.noun}. ${prompt.trim()}`.trim() : prompt.trim();
			const brief: Brief = await characterApi.brief(
				subject,
				settings.lang,
				photoUrl && !chosen ? photoUrl : undefined,
				'item'
			);
			if (disposed) return;
			if (brief.status !== 'ok') {
				note = { kind: brief.status, text: brief.message };
				phase = 'form';
				return;
			}
			let ref = reference;
			if (photo && !ref) ref = (await cutSubject(photo, brief.noun, false, false)).reference;
			name = brief.name;
			const made = await createItem(
				{ visual: brief.visual, noun: chosen?.noun ?? brief.noun, style, reference: ref },
				(step: StepId, state: StepState, message?: string) => {
					if (!disposed) steps = { ...steps, [step]: { state, message } };
				}
			);
			if (disposed) return;
			strip = made;
			phase = 'review';
		} catch (e) {
			if (disposed) return;
			fail(e);
			phase = 'form';
		}
	}

	// Vista previa: los tres cuadros, con el normal "flotando" como en el juego.
	let canvas: HTMLCanvasElement | undefined = $state();
	$effect(() => {
		const s = strip;
		const c = canvas;
		if (!s || !c) return;
		const sheet = rasterToCanvas(s.raster);
		const g = c.getContext('2d')!;
		let raf = 0;
		const paint = (now: number) => {
			g.clearRect(0, 0, c.width, c.height);
			const cell = c.width / s.frames;
			const k = Math.min((cell * 0.8) / s.frameWidth, (c.height * 0.8) / s.frameHeight);
			for (let f = 0; f < s.frames; f++) {
				const bob = f === 0 ? Math.sin(now / 250) * 3 : 0;
				g.drawImage(
					sheet,
					f * s.frameWidth,
					0,
					s.frameWidth,
					s.frameHeight,
					f * cell + (cell - s.frameWidth * k) / 2,
					(c.height - s.frameHeight * k) / 2 + bob,
					s.frameWidth * k,
					s.frameHeight * k
				);
			}
			raf = requestAnimationFrame(paint);
		};
		raf = requestAnimationFrame(paint);
		return () => cancelAnimationFrame(raf);
	});

	async function save() {
		if (!strip || saving) return;
		saving = true;
		try {
			const rec = await addItem({
				name: name.trim() || t('item.defaultName'),
				style,
				sheet: {
					blob: await rasterToPngBlob(strip.raster),
					frames: strip.frames,
					frameWidth: strip.frameWidth,
					frameHeight: strip.frameHeight
				}
			});
			settings.collectible = `custom:${rec.id}`;
			onCreated();
		} catch (e) {
			fail(e);
		} finally {
			saving = false;
		}
	}

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
	const CHECKER =
		'background-image: linear-gradient(45deg,#0000000f 25%,transparent 25%,transparent 75%,#0000000f 75%),linear-gradient(45deg,#0000000f 25%,transparent 25%,transparent 75%,#0000000f 75%); background-size: 16px 16px; background-position: 0 0, 8px 8px;';
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
		aria-labelledby="item-title"
	>
		<div class="flex items-center justify-between">
			<h3 id="item-title" class="text-lg font-bold">✨ {t('item.title')}</h3>
			<button
				class="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 disabled:opacity-40"
				aria-label={t('range.close')}
				disabled={phase === 'working'}
				onclick={onClose}>✕</button
			>
		</div>

		{#if phase === 'form'}
			<p class="mt-1 text-sm text-muted">{t('item.intro')}</p>
			<textarea
				bind:value={prompt}
				rows="3"
				maxlength="600"
				placeholder={photo ? t('item.placeholderPhoto') : t('item.placeholder')}
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

			<div class="mt-4 rounded-lg border border-dashed border-border p-3">
				{#if !photo}
					<label class="flex cursor-pointer items-center gap-3 text-sm">
						<span class="grid h-10 w-10 place-items-center rounded-lg bg-surface-2 text-lg">📷</span
						>
						<span>
							<span class="block font-semibold">{t('char.photo')}</span>
							<span class="block text-xs text-muted">{t('char.photoHelp')}</span>
						</span>
						<input
							type="file"
							accept="image/png,image/jpeg,image/webp"
							class="sr-only"
							onchange={(e) => onFile(e.currentTarget.files?.[0])}
						/>
					</label>
				{:else}
					<div class="flex items-start gap-3">
						<img
							src={photoUrl}
							alt=""
							class="h-24 w-24 shrink-0 rounded-lg bg-surface-2 object-contain"
						/>
						<div class="min-w-0 flex-1 text-sm">
							{#if looking}
								<p class="text-muted" role="status">{t('char.looking')}</p>
							{:else if objects.length}
								<p class="font-semibold">{t('char.whichOne')}</p>
								<div class="mt-1.5 flex flex-wrap gap-1.5">
									{#each objects as o (o.noun)}
										<button
											class="rounded-lg border px-2.5 py-1 text-xs font-semibold transition disabled:opacity-60 {chosen?.noun ===
											o.noun
												? 'border-accent bg-accent text-white'
												: 'border-border bg-surface-2 hover:border-accent/50'}"
											disabled={cutting}
											aria-pressed={chosen?.noun === o.noun}
											onclick={() => pick(o)}>{o.label}</button
										>
									{/each}
								</div>
							{/if}
							{#if cutting}<p class="mt-2 text-xs text-muted" role="status">
									{t('char.cutting')}
								</p>{/if}
						</div>
						<button
							class="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2 hover:text-red-600"
							aria-label={t('char.removePhoto')}
							title={t('char.removePhoto')}
							onclick={clearPhoto}>✕</button
						>
					</div>
					{#if cutUrl}
						<div class="mt-3 flex items-center gap-3">
							<div class="grid h-20 w-20 place-items-center rounded-lg" style={CHECKER}>
								<img src={cutUrl} alt="" class="max-h-20 max-w-20 object-contain" />
							</div>
							<p class="text-xs text-muted">{t('char.cutDone')}</p>
						</div>
					{/if}
				{/if}
			</div>

			{#if note}
				<div
					role="alert"
					class="mt-3 rounded-lg border p-3 text-sm {note.kind === 'refuse'
						? 'border-red-200 bg-red-50 text-red-700'
						: 'border-accent/40 bg-accent/10'}"
				>
					{note.text || (note.kind === 'refuse' ? t('char.refused') : t('char.clarify'))}
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
			{#if full}<p class="mt-3 text-sm text-red-700">{t('item.full', { n: MAX_ITEMS })}</p>{/if}

			<div class="mt-4 flex items-center justify-between gap-3">
				<span class="text-xs text-muted">{t('char.time')}</span>
				<button
					class="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
					disabled={!canCreate}
					onclick={create}>{t('item.create')}</button
				>
			</div>
		{:else if phase === 'working'}
			<p class="mt-1 text-sm text-muted">{t('item.working')}</p>
			<ul class="mt-4 space-y-2" aria-live="polite">
				{#each ['hero', 'item'] as const as s (s)}
					{@const st = steps[s]?.state ?? 'pending'}
					<li class="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
						{#if st === 'working'}
							<svg
								class="h-6 w-6 shrink-0 animate-spin text-accent"
								style:animation-timing-function="steps(8, end)"
								style:animation-duration="1s"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2.4"
								stroke-linecap="round"
								role="status"
								aria-label={t('item.working')}
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
						{:else}
							<span
								class="grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold {st ===
								'done'
									? 'bg-green-500 text-white'
									: st === 'failed'
										? 'bg-red-500 text-white'
										: 'bg-border'}">{st === 'done' ? '✓' : st === 'failed' ? '!' : ''}</span
							>
						{/if}
						<span class="flex-1">{t(s === 'hero' ? 'item.step.hero' : 'char.step.item')}</span>
						{#if steps[s]?.message}<span class="text-xs text-red-600">{steps[s].message}</span>{/if}
					</li>
				{/each}
			</ul>
			<p class="mt-3 text-xs text-muted">{t('char.keepOpen')}</p>
		{:else}
			<p class="mt-1 text-sm text-muted">{t('item.review')}</p>
			<div class="mt-3 overflow-hidden rounded-lg" style={CHECKER}>
				<canvas bind:this={canvas} width="480" height="160" class="h-auto w-full"></canvas>
			</div>
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
						strip = null;
						phase = 'form';
					}}>{t('char.again')}</button
				>
				<button
					class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
					disabled={saving}
					onclick={save}>{t('item.save')}</button
				>
			</div>
		{/if}
	</div>
</div>
