<script lang="ts">
	// Crear un patrón de batería con IA: se describe el ritmo, el servidor le pide al modelo una grilla de
	// pasos por instrumento (con las muestras de la app) y se valida. Antes de usarlo se puede escuchar.
	// Al usarlo queda en la lista de patrones del compás elegido.
	import { onDestroy } from 'svelte';
	import { GenerateRequestError, requestDrumPattern } from '$lib/ai/client';
	import { DRUM_PARTS, STEPS_PER_MEASURE, STEPS_PER_TICK, type DrumResult } from '$lib/ai/drums';
	import type { DrumPattern } from '$lib/audio/drums';
	import { playDrumPattern, stopPreview } from '$lib/audio/preview';
	import { t } from '$lib/i18n';
	import type { MeterId } from '$lib/music/meter';
	import { settings } from '$lib/settings.svelte';

	let {
		meter: initialMeter,
		onUse
	}: { meter: MeterId; onUse: (result: DrumResult, meter: MeterId) => void } = $props();

	const EXAMPLES = ['drums.ex1', 'drums.ex2', 'drums.ex3'] as const;
	const PREVIEW_BPM = 80;

	let prompt = $state('');
	let meter = $derived<MeterId>(initialMeter);
	let loading = $state(false);
	let listening = $state(false);
	let error = $state('');
	let details = $state<string[]>([]);
	/** El resultado se guarda con el compás con que se pidió. */
	let result = $state<{ data: DrumResult; meter: MeterId } | null>(null);

	async function create() {
		if (!prompt.trim() || loading) return;
		stopPreview();
		loading = true;
		error = '';
		details = [];
		result = null;
		try {
			result = { data: await requestDrumPattern(prompt, meter, settings.lang), meter };
		} catch (e) {
			error = e instanceof Error ? e.message : t('create.error');
			details = e instanceof GenerateRequestError ? e.details : [];
		} finally {
			loading = false;
		}
	}

	async function listen() {
		if (!result) return;
		if (listening) {
			stopPreview();
			return;
		}
		const pattern: DrumPattern = {
			id: 'preview',
			name: result.data.name,
			meter: result.meter,
			stepsPerTick: STEPS_PER_TICK[result.meter],
			tracks: result.data.tracks
		};
		listening = true;
		await playDrumPattern(pattern, PREVIEW_BPM, 2);
		listening = false;
	}

	onDestroy(stopPreview);

	/** Pasos por compás y por pulso del patrón elegido (para marcar la grilla). */
	const perMeasure = $derived(STEPS_PER_MEASURE[result?.meter ?? '4/4']);
	const perTick = $derived(STEPS_PER_TICK[result?.meter ?? '4/4']);
	const rows = $derived(
		result
			? DRUM_PARTS.filter((p) => result!.data.tracks[p]).map((p) => ({
					part: p,
					cells: [...result!.data.tracks[p]!]
				}))
			: []
	);
</script>

<p class="mt-1 text-sm text-muted">{t('drums.intro')}</p>

<textarea
	bind:value={prompt}
	rows="3"
	maxlength="500"
	placeholder={t('drums.placeholder')}
	class="mt-3 w-full resize-none rounded-lg border border-border bg-base px-3 py-2 text-sm outline-none focus:border-accent"
	onkeydown={(e) => {
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void create();
	}}></textarea>
<div class="mt-2 flex flex-wrap gap-1.5">
	{#each EXAMPLES as key (key)}
		<button
			class="rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs hover:border-accent/50"
			onclick={() => (prompt = t(key))}>{t(key)}</button
		>
	{/each}
</div>

<div class="mt-3 flex items-center justify-end gap-3">
	<div
		class="mr-auto flex rounded-lg border border-border bg-surface-2 p-0.5 text-sm"
		role="radiogroup"
		aria-label={t('create.meter')}
	>
		<span class="self-center px-2 text-xs text-muted">{t('create.meter')}</span>
		{#each ['4/4', '6/8'] as const as m (m)}
			<button
				class="rounded-md px-3 py-1 font-semibold {meter === m
					? 'bg-accent text-white'
					: 'text-muted hover:text-fg'}"
				role="radio"
				aria-checked={meter === m}
				onclick={() => (meter = m)}>{m}</button
			>
		{/each}
	</div>
	<button
		class="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
		disabled={!prompt.trim() || loading}
		onclick={create}>{loading ? t('drums.working') : t('drums.submit')}</button
	>
</div>

{#if error}
	<div
		role="alert"
		class="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
	>
		<p class="font-semibold">{t('create.error')} {error}</p>
		{#if details.length}
			<ul class="mt-1 list-disc pl-5 text-xs">
				{#each details as d, i (i)}<li>{d}</li>{/each}
			</ul>
		{/if}
	</div>
{/if}

{#if result}
	<div class="mt-4 rounded-lg border border-border bg-base p-3">
		<div class="font-bold">{result.data.name} <span class="text-muted">({result.meter})</span></div>
		<!-- Grilla: un renglón por instrumento, una celda por paso; cada compás con su separación -->
		<div class="mt-2 space-y-1 overflow-x-auto">
			{#each rows as r (r.part)}
				<div class="flex items-center gap-2">
					<span class="w-20 shrink-0 text-right text-[11px] text-muted">{t(`drums.${r.part}`)}</span
					>
					<div class="flex">
						{#each r.cells as c, i (i)}
							<span
								class="h-3.5 w-2.5 border-y border-border {i > 0 && i % perMeasure === 0
									? 'ml-2'
									: ''} {i % perTick === 0 ? 'border-l' : ''} {c === 'x'
									? 'bg-accent'
									: 'bg-surface'}"
							></span>
						{/each}
					</div>
				</div>
			{/each}
		</div>
		<div class="mt-2 text-xs text-muted">
			{t('create.attempts', { n: result.data.attempts, model: result.data.model })}
		</div>
		<div class="mt-3 flex justify-end gap-2">
			<button
				class="mr-auto inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-sm hover:bg-surface-2 {listening
					? 'border-accent text-accent'
					: ''}"
				onclick={listen}
				>{listening ? '■' : '▶'}
				{listening ? t('create.stopListen') : t('create.listen')}</button
			>
			<button
				class="rounded-lg border border-border bg-surface px-4 py-2 text-sm hover:bg-surface-2"
				onclick={create}>{t('create.again')}</button
			>
			<button
				class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
				onclick={() => {
					stopPreview();
					if (result) onUse(result.data, result.meter);
				}}>{t('drums.use')}</button
			>
		</div>
	</div>
{/if}
