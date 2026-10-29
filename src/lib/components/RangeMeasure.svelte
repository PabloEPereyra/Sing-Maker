<script lang="ts">
	// Medición del rango de voz con sirenas: durante unos segundos se canta de la nota más grave a la
	// más aguda y se guardan los extremos. La usan el selector de rango y el asistente de inicio.
	import { onDestroy, onMount } from 'svelte';
	import type { PitchDetector } from '$lib/audio/pitch';
	import { noteLabel } from '$lib/settings.svelte';
	import { t } from '$lib/i18n';

	let {
		low = $bindable(),
		high = $bindable(),
		getDetector,
		onClose,
		onNext
	}: {
		low: number;
		high: number;
		getDetector: () => Promise<PitchDetector | null>;
		onClose: () => void;
		/** Dentro de la guía de inicio: aplica lo medido y sigue con el paso siguiente. */
		onNext?: () => void;
	} = $props();

	const MIN_MIDI = 33; // A1
	const MEASURE_SECONDS = 20;

	let measuring = $state(false);
	let measureError = $state('');
	let secondsLeft = $state(MEASURE_SECONDS);
	let mLow = $state<number | null>(null);
	let mHigh = $state<number | null>(null);
	let current = $state<number | null>(null);
	let raf = 0;

	onMount(() => void startMeasure());
	onDestroy(() => cancelAnimationFrame(raf));

	async function startMeasure() {
		measureError = '';
		const d = await getDetector();
		if (!d) {
			measureError = t('range.micError');
			return;
		}
		mLow = mHigh = current = null;
		measuring = true;
		const deadline = performance.now() + MEASURE_SECONDS * 1000;
		// Una nota cuenta solo si se sostiene unos cuadros con buena claridad (descarta ruidos).
		let run: number[] = [];
		const loop = () => {
			if (!measuring) return;
			const now = performance.now();
			secondsLeft = Math.max(0, Math.ceil((deadline - now) / 1000));
			const r = d.read(now);
			if (r.midi !== null && r.clarity >= 0.6) {
				if (run.length && Math.abs(r.midi - run[run.length - 1]) > 0.8) run = [];
				run.push(r.midi);
				if (run.length >= 6) {
					const m = Math.round([...run].sort((a, b) => a - b)[run.length >> 1]);
					current = m;
					if (m >= MIN_MIDI) {
						mLow = mLow === null ? m : Math.min(mLow, m);
						mHigh = mHigh === null ? m : Math.max(mHigh, m);
					}
				}
			} else run = [];
			if (secondsLeft === 0) finishMeasure();
			else raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
	}

	function finishMeasure() {
		measuring = false;
		cancelAnimationFrame(raf);
		if (mLow !== null && mHigh !== null && mHigh > mLow) {
			low = mLow;
			high = mHigh;
			onClose();
		}
	}

	function next() {
		measuring = false;
		cancelAnimationFrame(raf);
		if (mLow !== null && mHigh !== null && mHigh > mLow) {
			low = mLow;
			high = mHigh;
		}
		onNext?.();
	}

	function close() {
		measuring = false;
		cancelAnimationFrame(raf);
		onClose();
	}
</script>

<div
	class="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
	role="dialog"
	aria-modal="true"
	aria-labelledby="measure-title"
>
	<div class="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-xl">
		<h3 id="measure-title" class="font-bold">{t('range.measureTitle')}</h3>
		<p class="mt-1 text-sm text-muted">{t('range.measureBody', { s: MEASURE_SECONDS })}</p>
		{#if measureError}
			<p role="alert" class="mt-3 text-sm text-red-600">{measureError}</p>
		{/if}
		<div class="mt-4 flex flex-col items-center gap-3">
			{#if measuring}
				<div class="text-3xl font-bold text-accent tabular-nums">{secondsLeft}s</div>
			{/if}
			<div class="grid w-full grid-cols-3 gap-2">
				{#each [[t('range.low'), mLow], [t('range.now'), current], [t('range.high'), mHigh]] as [label, value] (label)}
					<div class="rounded-lg border border-border bg-surface-2 p-2 text-center">
						<div class="text-xs text-muted">{label}</div>
						<div class="text-lg font-bold text-accent">
							{typeof value === 'number' ? noteLabel(value) : '—'}
						</div>
					</div>
				{/each}
			</div>
			<div class="flex w-full gap-2">
				{#if measuring}
					<button
						type="button"
						class="flex-1 rounded-lg bg-accent py-2 text-sm font-semibold text-white"
						onclick={finishMeasure}>{t('range.done')}</button
					>
				{:else}
					<button
						type="button"
						class="flex-1 rounded-lg bg-accent py-2 text-sm font-semibold text-white"
						onclick={startMeasure}>{t('range.start')}</button
					>
				{/if}
				<button
					type="button"
					class="rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm"
					onclick={close}>{t('range.close')}</button
				>
				{#if onNext}
					<button
						type="button"
						class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
						onclick={next}>{t('onb.next')}</button
					>
				{/if}
			</div>
		</div>
	</div>
</div>
