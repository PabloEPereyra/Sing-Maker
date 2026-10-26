<script lang="ts">
	// Rango de voz: un botón compacto ("Rango" + las dos notas) que abre un panel con las opciones
	// de Voicexplorer/vocal-scales: grilla manual, medición con sirenas y presets por tipo de voz.
	// El rango se cambia pocas veces, así que no ocupa lugar fijo en la interfaz.
	import { onDestroy, onMount } from 'svelte';
	import { VOICE_PRESETS } from '$lib/exercises/catalog';
	import { NOTE_NAMES } from '$lib/music/notes';
	import { noteLabel, settings, toggleNotation } from '$lib/settings.svelte';
	import { t, tDynamic } from '$lib/i18n';
	import type { PitchDetector } from '$lib/audio/pitch';

	interface Props {
		low: number;
		high: number;
		getDetector: () => Promise<PitchDetector | null>;
	}

	let { low = $bindable(), high = $bindable(), getDetector }: Props = $props();

	const MIN_MIDI = 33; // A1
	const MEASURE_SECONDS = 20;
	const SOLFEGE = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
	const NOTES = $derived(settings.notation === 'american' ? NOTE_NAMES : SOLFEGE);
	const OCTAVES = [1, 2, 3, 4, 5, 6, 7];

	let panel = $state(false);
	let open = $state<'manual' | 'presets' | null>(null);
	let root: HTMLDivElement;

	// medición
	let measuring = $state(false);
	let showMeasure = $state(false);
	let measureError = $state('');
	let secondsLeft = $state(MEASURE_SECONDS);
	let mLow = $state<number | null>(null);
	let mHigh = $state<number | null>(null);
	let current = $state<number | null>(null);
	let raf = 0;

	onMount(() => {
		const close = (e: PointerEvent) => {
			if (panel && !root.contains(e.target as Node)) {
				panel = false;
				open = null;
			}
		};
		document.addEventListener('pointerdown', close);
		return () => document.removeEventListener('pointerdown', close);
	});

	onDestroy(() => cancelAnimationFrame(raf));

	function gridClick(midi: number) {
		if (midi < MIN_MIDI) return;
		if (midi < low) low = midi;
		else if (midi > high) high = midi;
		else if (midi - low < high - midi) low = midi;
		else high = midi;
		if (low >= high) high = Math.min(107, low + 1);
	}

	async function startMeasure() {
		measureError = '';
		panel = false;
		open = null;
		showMeasure = true;
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
			showMeasure = false;
		}
	}

	function closeMeasure() {
		measuring = false;
		cancelAnimationFrame(raf);
		showMeasure = false;
	}
</script>

<div bind:this={root} class="relative">
	<button
		type="button"
		class="flex flex-col items-center rounded-lg border border-border bg-surface px-3 pt-0.5 pb-1 leading-tight transition hover:border-accent/50"
		aria-expanded={panel}
		onclick={() => {
			panel = !panel;
			open = null;
		}}
	>
		<span class="text-[10px] font-semibold tracking-widest text-muted uppercase"
			>{t('range.label')}</span
		>
		<span class="text-sm font-bold text-accent tabular-nums"
			>{noteLabel(low)} – {noteLabel(high)}</span
		>
	</button>

	{#if panel}
		<div
			class="absolute top-full right-0 z-40 mt-2 w-[300px] max-w-[92vw] rounded-lg border border-border bg-surface p-3 text-fg shadow-xl"
		>
			<div class="text-center text-xs font-semibold tracking-widest text-muted uppercase">
				{t('range.title')}
			</div>
			<div class="mt-2 flex items-center justify-center gap-2">
				{#each [low, high] as m, i (i)}
					{#if i}<span class="text-muted">–</span>{/if}
					<button
						type="button"
						class="w-24 rounded-lg border border-border bg-base px-3 py-1.5 text-center transition hover:border-accent/50"
						title={t('range.toggleHint')}
						onclick={toggleNotation}
					>
						<span class="text-lg font-bold text-accent">{noteLabel(m)}</span>
					</button>
				{/each}
			</div>
			<div class="mt-3 grid grid-cols-3 gap-1.5">
				<button
					type="button"
					class="rounded-lg border px-2 py-1.5 text-xs font-semibold transition {open === 'manual'
						? 'border-accent bg-accent text-white'
						: 'border-border bg-surface hover:border-accent/50'}"
					aria-expanded={open === 'manual'}
					onclick={() => (open = open === 'manual' ? null : 'manual')}>{t('range.manual')}</button
				>
				<button
					type="button"
					class="rounded-lg border border-border bg-surface px-2 py-1.5 text-xs font-semibold transition hover:border-accent/50"
					onclick={startMeasure}>{t('range.measure')}</button
				>
				<button
					type="button"
					class="rounded-lg border px-2 py-1.5 text-xs font-semibold transition {open === 'presets'
						? 'border-accent bg-accent text-white'
						: 'border-border bg-surface hover:border-accent/50'}"
					aria-expanded={open === 'presets'}
					onclick={() => (open = open === 'presets' ? null : 'presets')}
					>{t('range.presets')}</button
				>
			</div>

			{#if open === 'manual'}
				<div class="mt-3 grid grid-cols-8 gap-[2px]">
					<div></div>
					<div
						class="col-span-7 text-center text-[10px] font-bold tracking-widest text-muted uppercase"
					>
						{t('range.octave')}
					</div>
					<div></div>
					{#each OCTAVES as oct (oct)}
						<div class="text-center text-[10px] font-bold text-muted">{oct}</div>
					{/each}
					{#each NOTES as name, pc (name)}
						<div class="flex h-[22px] items-center text-[9px] font-bold text-muted">{name}</div>
						{#each OCTAVES as oct (oct)}
							{@const midi = (oct + 1) * 12 + pc}
							{@const disabled = midi < MIN_MIDI}
							{@const endpoint = midi === low || midi === high}
							{@const inside = midi > low && midi < high}
							<button
								type="button"
								{disabled}
								title={noteLabel(midi)}
								aria-label={noteLabel(midi)}
								onclick={() => gridClick(midi)}
								class="h-[22px] w-full rounded-lg border text-[8px] font-bold transition {disabled
									? 'cursor-not-allowed border-border/50 bg-surface-2 opacity-40'
									: endpoint
										? 'border-accent bg-accent text-white'
										: inside
											? 'border-accent/30 bg-accent/20 text-accent'
											: 'border-border bg-base hover:border-accent/50'}"
							>
								{endpoint ? oct : ''}
							</button>
						{/each}
					{/each}
				</div>
			{:else if open === 'presets'}
				<div class="mt-3 space-y-0.5">
					{#each VOICE_PRESETS as p (p.id)}
						<button
							type="button"
							class="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-xs font-semibold transition {low ===
								p.low && high === p.high
								? 'bg-accent text-white'
								: 'hover:bg-accent/10'}"
							onclick={() => {
								low = p.low;
								high = p.high;
							}}
						>
							{tDynamic(`voice.${p.id}`, p.name)}
							<span class="text-[10px] tabular-nums opacity-70"
								>{noteLabel(p.low)}–{noteLabel(p.high)}</span
							>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

{#if showMeasure}
	<div
		class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
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
						onclick={closeMeasure}>{t('range.close')}</button
					>
				</div>
			</div>
		</div>
	</div>
{/if}
