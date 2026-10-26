<script lang="ts">
	// Selector de rango al estilo de Voicexplorer/vocal-scales: grilla manual, medición con
	// sirenas, último rango medido y presets por tipo de voz.
	import { onDestroy, onMount } from 'svelte';
	import { VOICE_PRESETS } from '$lib/exercises/catalog';
	import { midiToSolfege } from '$lib/music/notes';
	import type { PitchDetector } from '$lib/audio/pitch';

	interface Props {
		low: number;
		high: number;
		getDetector: () => Promise<PitchDetector | null>;
	}

	let { low = $bindable(), high = $bindable(), getDetector }: Props = $props();

	const MEASURED_KEY = 'singmaker-measured-range';
	const MIN_MIDI = 33; // A1
	const MEASURE_SECONDS = 20;
	const NOTES = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
	const OCTAVES = [1, 2, 3, 4, 5, 6, 7];

	let open = $state<'manual' | 'presets' | null>(null);
	let root: HTMLDivElement;
	let measured = $state<{ low: number; high: number } | null>(null);

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
		try {
			const m = JSON.parse(localStorage.getItem(MEASURED_KEY) ?? 'null');
			if (m && typeof m.low === 'number' && typeof m.high === 'number') measured = m;
		} catch {}
		const close = (e: PointerEvent) => {
			if (open && !root.contains(e.target as Node)) open = null;
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
		showMeasure = true;
		const d = await getDetector();
		if (!d) {
			measureError = 'No se pudo usar el micrófono.';
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
			measured = { low: mLow, high: mHigh };
			try {
				localStorage.setItem(MEASURED_KEY, JSON.stringify(measured));
			} catch {}
			showMeasure = false;
		}
	}

	function closeMeasure() {
		measuring = false;
		cancelAnimationFrame(raf);
		showMeasure = false;
	}
</script>

<div bind:this={root} class="relative flex flex-col items-center gap-2">
	<div class="text-xs font-semibold tracking-widest text-muted uppercase">Rango de voz</div>
	<div class="flex items-center gap-2">
		<div class="w-24 rounded-lg border border-border bg-surface px-3 py-1.5 text-center">
			<div class="text-lg font-bold text-accent">{midiToSolfege(low)}</div>
		</div>
		<span class="text-muted">–</span>
		<div class="w-24 rounded-lg border border-border bg-surface px-3 py-1.5 text-center">
			<div class="text-lg font-bold text-accent">{midiToSolfege(high)}</div>
		</div>
	</div>
	<div class="flex flex-wrap justify-center gap-1.5">
		<div>
			<button
				type="button"
				class="w-24 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs font-semibold hover:border-accent/50"
				aria-expanded={open === 'manual'}
				onclick={() => (open = open === 'manual' ? null : 'manual')}>Manual</button
			>
			{#if open === 'manual'}
				<div
					class="absolute bottom-full left-1/2 z-30 mb-2 w-[284px] max-w-[92vw] -translate-x-1/2 rounded-lg border border-border bg-surface p-3 shadow-xl"
				>
					<div class="grid grid-cols-8 gap-[2px]">
						<div></div>
						<div
							class="col-span-7 text-center text-[10px] font-bold tracking-widest text-muted uppercase"
						>
							Octava
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
									title={midiToSolfege(midi)}
									aria-label={midiToSolfege(midi)}
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
					<div class="mt-2 flex justify-center">
						<button
							type="button"
							class="rounded-lg bg-accent px-3 py-1 text-xs font-semibold text-white"
							onclick={() => (open = null)}>Listo</button
						>
					</div>
				</div>
			{/if}
		</div>
		<button
			type="button"
			class="w-24 rounded-lg bg-accent px-2 py-1.5 text-xs font-semibold text-white hover:brightness-110"
			onclick={startMeasure}>Medir</button
		>
		<button
			type="button"
			class="w-24 rounded-lg border border-border bg-surface px-2 py-1.5 text-xs font-semibold hover:border-accent/50 disabled:cursor-not-allowed disabled:opacity-40"
			disabled={!measured}
			title={measured
				? `${midiToSolfege(measured.low)}–${midiToSolfege(measured.high)}`
				: 'Todavía no mediste tu rango'}
			onclick={() => {
				if (measured) {
					low = measured.low;
					high = measured.high;
				}
			}}>Medido</button
		>
		<div>
			<button
				type="button"
				class="w-24 rounded-lg border border-border bg-surface-2 px-2 py-1.5 text-xs font-semibold hover:border-accent/50"
				aria-expanded={open === 'presets'}
				onclick={() => (open = open === 'presets' ? null : 'presets')}>Voces ▾</button
			>
			{#if open === 'presets'}
				<div
					class="absolute bottom-full left-1/2 z-30 mb-2 w-52 -translate-x-1/2 rounded-lg border border-border bg-surface p-1 shadow-xl"
				>
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
								open = null;
							}}
						>
							{p.name}
							<span class="text-[10px] tabular-nums opacity-70"
								>{midiToSolfege(p.low)}–{midiToSolfege(p.high)}</span
							>
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>

{#if showMeasure}
	<div
		class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
		role="dialog"
		aria-modal="true"
		aria-labelledby="measure-title"
	>
		<div class="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-xl">
			<h3 id="measure-title" class="font-bold">Medir rango de voz</h3>
			<p class="mt-1 text-sm text-muted">
				Hacé sirenas desde tu nota más grave hasta la más aguda, sin forzar. Tenés {MEASURE_SECONDS}
				segundos o terminá antes con «Listo».
			</p>
			{#if measureError}
				<p role="alert" class="mt-3 text-sm text-red-600">{measureError}</p>
			{/if}
			<div class="mt-4 flex flex-col items-center gap-3">
				{#if measuring}
					<div class="text-3xl font-bold text-accent tabular-nums">{secondsLeft}s</div>
				{/if}
				<div class="grid w-full grid-cols-3 gap-2">
					{#each [['Grave', mLow], ['Ahora', current], ['Aguda', mHigh]] as [label, value] (label)}
						<div class="rounded-lg border border-border bg-surface-2 p-2 text-center">
							<div class="text-xs text-muted">{label}</div>
							<div class="text-lg font-bold text-accent">
								{typeof value === 'number' ? midiToSolfege(value) : '—'}
							</div>
						</div>
					{/each}
				</div>
				<div class="flex w-full gap-2">
					{#if measuring}
						<button
							type="button"
							class="flex-1 rounded-lg bg-accent py-2 text-sm font-semibold text-white"
							onclick={finishMeasure}>Listo</button
						>
					{:else}
						<button
							type="button"
							class="flex-1 rounded-lg bg-accent py-2 text-sm font-semibold text-white"
							onclick={startMeasure}>Empezar</button
						>
					{/if}
					<button
						type="button"
						class="rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm"
						onclick={closeMeasure}>Cerrar</button
					>
				</div>
			</div>
		</div>
	</div>
{/if}
