<script lang="ts">
	// "Crear personaje con IA". Reparto de modelos (de barato a caro): Spark 1.3 interpreta el pedido y
	// reconoce qué hay en una foto; SAM 3.1 recorta (un objeto de la foto y cada pose de las tiras);
	// Muse Image dibuja las poses. Después se anima en vivo para aprobarlo y queda guardado en el dispositivo.
	import { onDestroy } from 'svelte';
	import type { Brief } from '$lib/ai/character';
	import { characterApi } from '$lib/ai/characterClient';
	import { GenerateRequestError } from '$lib/ai/client';
	import {
		blobToRaster,
		createCharacter,
		cutSubject,
		rasterToCanvas,
		rasterToJpegUrl,
		rasterToPngBlob,
		rasterToPngUrl,
		type CreatedStrips,
		type StepId,
		type StepState
	} from '$lib/character/create';
	import { downloadCharacter } from '$lib/character/export';
	import type { Raster, Strip } from '$lib/character/process';
	import { CharacterError, STYLES, type Movement, type StyleId } from '$lib/character/spec';
	import {
		addCharacter,
		characters,
		customId,
		MAX_CHARACTERS,
		type SheetRecord
	} from '$lib/character/store.svelte';
	import { t, tDynamic } from '$lib/i18n';
	import { settings } from '$lib/settings.svelte';

	let { onClose, onCreated }: { onClose: () => void; onCreated: () => void } = $props();

	// ---------- formulario ----------
	let movement = $state<Movement>('walk');
	let style = $state<StyleId>('cute3d');
	let prompt = $state('');
	let name = $state('');

	// ---------- foto (opcional) ----------
	let photo = $state.raw<Raster | null>(null);
	let photoUrl = $state('');
	let objects = $state<{ noun: string; label: string }[]>([]);
	let looking = $state(false);
	let chosen = $state<{ noun: string; label: string } | null>(null);
	let cutting = $state(false);
	let cutUrl = $state('');
	let reference = $state<string | undefined>();

	// ---------- proceso ----------
	type Phase = 'form' | 'working' | 'review';
	let phase = $state<Phase>('form');
	let steps = $state<Record<string, { state: StepState; message?: string }>>({});
	let error = $state('');
	let details = $state<string[]>([]);
	let note = $state<{ kind: 'clarify' | 'refuse'; text: string } | null>(null);
	let result = $state.raw<CreatedStrips | null>(null);
	let saving = $state(false);
	let disposed = false;

	onDestroy(() => (disposed = true));

	const full = $derived(characters.list.length >= MAX_CHARACTERS);
	const canCreate = $derived(
		!full &&
			(prompt.trim().length > 0 || photo !== null) &&
			phase === 'form' &&
			!looking &&
			!cutting
	);
	const order = $derived<StepId[]>(
		movement === 'walk' ? ['hero', 'move', 'jump', 'stand'] : ['hero', 'move', 'stand']
	);

	function fail(e: unknown) {
		error =
			e instanceof CharacterError
				? t(`char.err.${e.code}` as 'char.err.notFound')
				: e instanceof Error
					? e.message
					: t('char.error');
		details = e instanceof GenerateRequestError ? e.details : [];
	}

	async function onFile(file: File | undefined) {
		if (!file) return;
		error = '';
		details = [];
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

	/** SAM recorta el objeto elegido de la foto; ese recorte es la referencia de todas las poses. */
	async function pick(o: { noun: string; label: string }) {
		if (!photo || cutting) return;
		chosen = o;
		cutting = true;
		error = '';
		details = [];
		try {
			const cut = await cutSubject(photo, o.noun);
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
		details = [];
		note = null;
		steps = { hero: { state: 'working' } };
		phase = 'working';
		try {
			const subject = chosen ? `Subject: ${chosen.noun}. ${prompt.trim()}`.trim() : prompt.trim();
			const brief: Brief = await characterApi.brief(
				subject,
				settings.lang,
				photoUrl && !chosen ? photoUrl : undefined
			);
			if (disposed) return;
			if (brief.status !== 'ok') {
				note = { kind: brief.status, text: brief.message };
				phase = 'form';
				return;
			}
			let ref = reference;
			if (photo && !ref) ref = (await cutSubject(photo, brief.noun)).reference;
			name = brief.name;
			const created = await createCharacter(
				{
					movement,
					visual: brief.visual,
					noun: chosen?.noun ?? brief.noun,
					style,
					flight: movement === 'fly' ? brief.flight : undefined,
					reference: ref
				},
				(step, state, message) => {
					if (!disposed) steps = { ...steps, [step]: { state, message } };
				}
			);
			if (disposed) return;
			result = created;
			phase = 'review';
		} catch (e) {
			if (disposed) return;
			fail(e);
			phase = 'form';
		}
	}

	// ---------- vista previa animada ----------
	let canvasMove: HTMLCanvasElement | undefined = $state();
	let canvasJump: HTMLCanvasElement | undefined = $state();
	let canvasStand: HTMLCanvasElement | undefined = $state();

	function drawLoop(
		canvas: HTMLCanvasElement | undefined,
		strip: Strip | undefined,
		fps: number,
		frames?: number[]
	): (() => void) | undefined {
		if (!canvas || !strip) return;
		const sheet = rasterToCanvas(strip.raster);
		const g = canvas.getContext('2d')!;
		const seq = frames ?? Array.from({ length: strip.frames }, (_, i) => i);
		let raf = 0;
		const start = performance.now();
		const paint = (now: number) => {
			const frame = seq[Math.floor(((now - start) / 1000) * fps) % seq.length];
			g.clearRect(0, 0, canvas.width, canvas.height);
			const k = Math.min(
				(canvas.width * 0.9) / strip.frameWidth,
				(canvas.height * 0.9) / strip.frameHeight
			);
			const w = strip.frameWidth * k;
			const h = strip.frameHeight * k;
			g.drawImage(
				sheet,
				frame * strip.frameWidth,
				0,
				strip.frameWidth,
				strip.frameHeight,
				(canvas.width - w) / 2,
				movement === 'walk' ? canvas.height - h - 4 : (canvas.height - h) / 2,
				w,
				h
			);
			raf = requestAnimationFrame(paint);
		};
		raf = requestAnimationFrame(paint);
		return () => cancelAnimationFrame(raf);
	}

	$effect(() => drawLoop(canvasMove, result?.move, 10));
	$effect(() => drawLoop(canvasStand, result?.stand, 1.5));
	$effect(() => {
		const j = result?.jump;
		return drawLoop(canvasJump, j, 5, j ? [...Array(j.frames).keys()] : undefined);
	});

	/** Las tiras del resultado como hojas guardables (PNG con transparencia). */
	async function toSheets(r: CreatedStrips) {
		const sheet = async (s: Strip): Promise<SheetRecord> => ({
			blob: await rasterToPngBlob(s.raster),
			frames: s.frames,
			frameWidth: s.frameWidth,
			frameHeight: s.frameHeight
		});
		return {
			name: name.trim() || t('char.defaultName'),
			movement,
			stand: await sheet(r.stand),
			move: await sheet(r.move),
			jump: r.jump ? await sheet(r.jump) : undefined
		};
	}

	async function exportZip() {
		if (!result || saving) return;
		saving = true;
		try {
			await downloadCharacter(await toSheets(result));
		} catch (e) {
			fail(e);
		} finally {
			saving = false;
		}
	}

	async function save() {
		if (!result || saving) return;
		saving = true;
		try {
			const rec = await addCharacter(await toSheets(result));
			settings.character = customId(rec.id);
			onCreated();
		} catch (e) {
			fail(e);
		} finally {
			saving = false;
		}
	}

	function again() {
		result = null;
		phase = 'form';
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && phase !== 'working') onClose();
	}

	const STYLE_KEYS = {
		cute3d: 'char.style.cute3d',
		cartoon: 'char.style.cartoon',
		pixel: 'char.style.pixel',
		watercolor: 'char.style.watercolor'
	} as const;
	const STEP_KEYS = {
		hero: 'char.step.hero',
		move: 'char.step.move',
		jump: 'char.step.jump',
		stand: 'char.step.stand'
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
		aria-labelledby="char-title"
	>
		<div class="flex items-center justify-between">
			<h3 id="char-title" class="text-lg font-bold">✨ {t('char.title')}</h3>
			<button
				class="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2 disabled:opacity-40"
				aria-label={t('range.close')}
				disabled={phase === 'working'}
				onclick={onClose}>✕</button
			>
		</div>

		{#if phase === 'form'}
			<p class="mt-1 text-sm text-muted">{t('char.intro')}</p>

			<div class="mt-4 flex gap-2" role="radiogroup" aria-label={t('char.type')}>
				{#each [['walk', 'character.walker'], ['fly', 'character.flyer']] as const as [m, label] (m)}
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
				{movement === 'walk' ? t('char.walkHelp') : t('char.flyHelp')}
			</p>

			<textarea
				bind:value={prompt}
				rows="3"
				maxlength="600"
				placeholder={photo ? t('char.placeholderPhoto') : t('char.placeholder')}
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

			<!-- Foto opcional -->
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
							{#if cutting}
								<p class="mt-2 text-xs text-muted" role="status">{t('char.cutting')}</p>
							{/if}
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
				<div
					role="alert"
					class="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
				>
					<p class="font-semibold">{error}</p>
					{#if details.length}
						<ul class="mt-1 list-disc pl-5 text-xs">
							{#each details as d, i (i)}<li>{d}</li>{/each}
						</ul>
					{/if}
				</div>
			{/if}
			{#if full}
				<p class="mt-3 text-sm text-red-700">{t('char.full', { n: MAX_CHARACTERS })}</p>
			{/if}

			<div class="mt-4 flex items-center justify-between gap-3">
				<span class="text-xs text-muted">{t('char.time')}</span>
				<button
					class="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
					disabled={!canCreate}
					onclick={create}>{t('char.create')}</button
				>
			</div>
		{:else if phase === 'working'}
			<p class="mt-1 text-sm text-muted">{t('char.working')}</p>
			<ul class="mt-4 space-y-2" aria-live="polite">
				{#each order as s (s)}
					{@const st = steps[s]?.state ?? 'pending'}
					<li class="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2 text-sm">
						{#if st === 'working'}
							<!-- Rueda de espera: ocho rayitas que giran "a saltos", como el indicador de Claude -->
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
								aria-label={t('char.working')}
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
										: 'bg-border'}"
							>
								{st === 'done' ? '✓' : st === 'failed' ? '!' : ''}
							</span>
						{/if}
						<span class="flex-1">{t(STEP_KEYS[s])}</span>
						{#if steps[s]?.message}<span class="text-xs text-red-600">{steps[s].message}</span>{/if}
					</li>
				{/each}
			</ul>
			<p class="mt-3 text-xs text-muted">{t('char.keepOpen')}</p>
		{:else}
			<p class="mt-1 text-sm text-muted">{t('char.review')}</p>
			<div
				class="mt-3 grid gap-2"
				style:grid-template-columns="repeat({result?.jump ? 3 : 2}, minmax(0, 1fr))"
			>
				{#each [{ c: 'move', label: movement === 'walk' ? 'char.run' : 'char.fly' }, ...(result?.jump ? [{ c: 'jump', label: 'char.jump' }] : []), { c: 'stand', label: 'char.stand' }] as p (p.c)}
					<div class="text-center">
						<div class="overflow-hidden rounded-lg" style={CHECKER}>
							{#if p.c === 'move'}
								<canvas bind:this={canvasMove} width="200" height="200" class="h-auto w-full"
								></canvas>
							{:else if p.c === 'jump'}
								<canvas bind:this={canvasJump} width="200" height="200" class="h-auto w-full"
								></canvas>
							{:else}
								<canvas bind:this={canvasStand} width="200" height="200" class="h-auto w-full"
								></canvas>
							{/if}
						</div>
						<span class="text-xs text-muted">{tDynamic(p.label)}</span>
					</div>
				{/each}
			</div>
			<label class="mt-4 block text-sm">
				<span class="mb-1 block text-xs text-muted">{t('char.name')}</span>
				<input
					bind:value={name}
					maxlength="30"
					class="w-full rounded-lg border border-border bg-base px-3 py-1.5 outline-none focus:border-accent"
				/>
			</label>
			{#if error}
				<p role="alert" class="mt-3 text-sm text-red-700">{error}</p>
			{/if}
			<div class="mt-4 flex justify-end gap-2">
				<button
					class="mr-auto rounded-lg border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-2 disabled:opacity-50"
					disabled={saving}
					title={t('char.exportHelp')}
					onclick={exportZip}>⬇ {t('char.export')}</button
				>
				<button
					class="rounded-lg border border-border bg-surface px-4 py-2 text-sm hover:bg-surface-2"
					onclick={again}>{t('char.again')}</button
				>
				<button
					class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
					disabled={saving}
					onclick={save}>{t('char.save')}</button
				>
			</div>
		{/if}
	</div>
</div>
