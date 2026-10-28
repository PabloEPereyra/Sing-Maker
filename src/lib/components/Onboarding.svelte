<script lang="ts">
	// Guía de inicio paso a paso: micrófono, rango, retraso de la voz y una prueba de oído que
	// recomienda el nivel donde empezar. Cada paso reutiliza las pantallas de siempre (medir rango,
	// sincronizar, calibrar) y se puede saltar o repetir desde el menú de configuración.
	import { onDestroy } from 'svelte';
	import { byLevel } from '$lib/exercises/catalog';
	import { getContext, loadPiano, playNote } from '$lib/audio/engine';
	import type { PitchDetector } from '$lib/audio/pitch';
	import { noteLabel, settings } from '$lib/settings.svelte';
	import { t, tDynamic } from '$lib/i18n';
	import MicCalibration from './MicCalibration.svelte';
	import RangeMeasure from './RangeMeasure.svelte';
	import SyncCalibration from './SyncCalibration.svelte';

	let {
		low = $bindable(),
		high = $bindable(),
		getDetector,
		onFinish,
		onClose
	}: {
		low: number;
		high: number;
		getDetector: () => Promise<PitchDetector | null>;
		/** Termina la guía con el nivel recomendado para empezar. */
		onFinish: (level: string) => void;
		onClose: () => void;
	} = $props();

	const STEPS = ['welcome', 'mic', 'range', 'sync', 'ear', 'done'] as const;
	type Step = (typeof STEPS)[number];

	/** Prueba de oído: notas que suenan, cuánto se espera hasta cantar y cuánto se escucha. */
	const TRIALS = 4;
	const NOTE_SEC = 1;
	const GAP_SEC = 0.4;
	const SING_SEC = 2.2;
	/** Distancia máxima (en semitonos) para dar la nota por afinada, sin importar la octava. */
	const TOLERANCE = 1;
	/** Con todas las notas afinadas se empieza en el nivel 2; si no, en el 1. */
	const SKILLED_HITS = TRIALS;

	let step = $state<Step>('welcome');
	let micOn = $state(false);
	let micFailed = $state(false);
	let measuring = $state(false);
	let syncing = $state(false);
	let calibrating = $state(false);

	// prueba de oído
	let testing = $state(false);
	let trial = $state(0);
	let singing = $state(false);
	let results = $state<boolean[]>([]);
	let testNoMic = $state(false);
	let raf = 0;

	const index = $derived(STEPS.indexOf(step));
	const hits = $derived(results.filter(Boolean).length);
	const level = $derived(results.length === TRIALS && hits >= SKILLED_HITS ? '2' : '1');
	const levelName = $derived(
		tDynamic(`level.${level}`, byLevel().find((l) => l.level === level)?.name ?? '')
	);

	onDestroy(() => {
		cancelAnimationFrame(raf);
		testing = false;
	});

	async function activateMic() {
		micFailed = false;
		micOn = !!(await getDetector());
		micFailed = !micOn;
	}

	/** Distancia entre dos alturas en semitonos, módulo octava. */
	const pitchClassDistance = (a: number, b: number) => {
		const d = Math.abs(a - b) % 12;
		return Math.min(d, 12 - d);
	};

	/** Cuatro notas dentro del rango, no demasiado juntas. */
	function targets(): number[] {
		const mid = Math.round((low + high) / 2);
		const span = Math.max(2, Math.min(6, Math.floor((high - low) / 4)));
		return [mid, mid + span, mid - Math.ceil(span / 2), mid + Math.ceil(span / 2)].map((m) =>
			Math.max(low, Math.min(high, m))
		);
	}

	async function runTest() {
		testNoMic = false;
		const d = await getDetector();
		if (!d) {
			testNoMic = true;
			return;
		}
		await Promise.race([loadPiano(), new Promise((r) => setTimeout(r, 1500))]);
		results = [];
		testing = true;
		const notes = targets();
		const ctx = getContext();
		for (trial = 0; trial < TRIALS && testing; trial++) {
			singing = false;
			const start = ctx.currentTime + 0.3;
			playNote(notes[trial], start, NOTE_SEC);
			await waitUntil(start + NOTE_SEC + GAP_SEC);
			if (!testing) return;
			singing = true;
			const heard = await listen(d, ctx.currentTime + SING_SEC);
			if (!testing) return;
			const median = heard.length >= 5 ? [...heard].sort((a, b) => a - b)[heard.length >> 1] : null;
			results = [
				...results,
				median !== null && pitchClassDistance(median, notes[trial]) <= TOLERANCE
			];
		}
		singing = false;
		testing = false;
	}

	const waitUntil = (time: number) =>
		new Promise<void>((resolve) => {
			const ctx = getContext();
			const tickLoop = () => {
				if (!testing || ctx.currentTime >= time) resolve();
				else raf = requestAnimationFrame(tickLoop);
			};
			tickLoop();
		});

	const listen = (d: PitchDetector, until: number) =>
		new Promise<number[]>((resolve) => {
			const ctx = getContext();
			const heard: number[] = [];
			const tickLoop = () => {
				const r = d.read();
				if (r.midi !== null && r.clarity >= 0.6) heard.push(r.midi);
				if (!testing || ctx.currentTime >= until) resolve(heard);
				else raf = requestAnimationFrame(tickLoop);
			};
			tickLoop();
		});

	function go(delta: number) {
		cancelAnimationFrame(raf);
		testing = false;
		step = STEPS[Math.max(0, Math.min(STEPS.length - 1, index + delta))];
	}

	const done = $derived(results.length === TRIALS && !testing);
</script>

<svelte:window
	onkeydown={(e) => e.key === 'Escape' && !measuring && !syncing && !calibrating && onClose()}
/>

<div class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm">
	<div
		class="flex max-h-[92dvh] w-full max-w-md flex-col overflow-y-auto rounded-lg bg-surface p-5 shadow-xl"
		role="dialog"
		aria-modal="true"
		aria-labelledby="onb-title"
	>
		<div class="flex items-center justify-between gap-3">
			<span class="text-xs font-semibold tracking-widest text-muted uppercase">
				{t('onb.step', { n: index + 1, total: STEPS.length })}
			</span>
			<button class="text-xs text-muted underline hover:text-fg" onclick={onClose}>
				{t('onb.skip')}
			</button>
		</div>
		<div class="mt-2 flex gap-1" aria-hidden="true">
			{#each STEPS as s, i (s)}
				<span class="h-2 flex-1 rounded-full {i <= index ? 'bg-accent' : 'bg-surface-2'}"></span>
			{/each}
		</div>

		<div class="mt-5">
			{#if step === 'welcome'}
				<h2 id="onb-title" class="text-xl font-bold">{t('onb.welcome.title')}</h2>
				<p class="mt-2 text-sm text-muted">{t('onb.welcome.body')}</p>
			{:else if step === 'mic'}
				<h2 id="onb-title" class="text-xl font-bold">{t('onb.mic.title')}</h2>
				<p class="mt-2 text-sm text-muted">{t('onb.mic.body')}</p>
				<div class="mt-4 flex flex-wrap items-center gap-2">
					<button
						class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
						onclick={activateMic}
					>
						{micOn ? t('onb.mic.ok') : t('onb.mic.on')}
					</button>
					{#if micOn}
						<button
							class="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
							onclick={() => (calibrating = true)}
						>
							{t('onb.mic.level')}
						</button>
					{/if}
				</div>
				{#if micFailed}
					<p role="alert" class="mt-3 text-sm text-red-600">{t('mic.error')}</p>
				{/if}
			{:else if step === 'range'}
				<h2 id="onb-title" class="text-xl font-bold">{t('onb.range.title')}</h2>
				<p class="mt-2 text-sm text-muted">{t('onb.range.body')}</p>
				<div class="mt-4 flex flex-wrap items-center gap-3">
					<button
						class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
						onclick={() => (measuring = true)}
					>
						{t('onb.range.measure')}
					</button>
					<span class="text-sm font-semibold text-accent">
						{t('onb.range.current', { low: noteLabel(low), high: noteLabel(high) })}
					</span>
				</div>
			{:else if step === 'sync'}
				<h2 id="onb-title" class="text-xl font-bold">{t('onb.sync.title')}</h2>
				<p class="mt-2 text-sm text-muted">{t('onb.sync.body')}</p>
				<div class="mt-4 flex flex-wrap items-center gap-3">
					<button
						class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
						onclick={() => (syncing = true)}
					>
						{t('onb.sync.measure')}
					</button>
					<span class="text-sm font-semibold text-accent">
						{t('onb.sync.current', { ms: settings.latencyMs })}
					</span>
				</div>
			{:else if step === 'ear'}
				<h2 id="onb-title" class="text-xl font-bold">{t('onb.ear.title')}</h2>
				<p class="mt-2 text-sm text-muted">{t('onb.ear.body')}</p>
				<div class="mt-4">
					{#if testing}
						<p class="font-semibold text-accent" role="status">
							{singing ? t('onb.ear.sing') : t('onb.ear.listen', { n: trial + 1, total: TRIALS })}
						</p>
					{:else}
						<button
							class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
							onclick={runTest}
						>
							{done ? t('onb.ear.retry') : t('onb.ear.start')}
						</button>
					{/if}
					{#if results.length}
						<div class="mt-3 flex items-center gap-1.5" aria-hidden="true">
							{#each results as ok, i (i)}
								<span
									class="grid h-7 w-7 place-items-center rounded-full text-sm font-bold text-white {ok
										? 'bg-green-500'
										: 'bg-orange-400'}">{ok ? '✓' : '·'}</span
								>
							{/each}
						</div>
					{/if}
					{#if done}
						<p class="mt-2 text-sm" role="status">
							{t('onb.ear.result', { hits, total: TRIALS })}
						</p>
					{/if}
					{#if testNoMic}
						<p role="alert" class="mt-3 text-sm text-red-600">{t('onb.ear.noMic')}</p>
					{/if}
				</div>
			{:else}
				<h2 id="onb-title" class="text-xl font-bold">{t('onb.done.title')}</h2>
				<p class="mt-2 font-semibold text-accent">
					{t('onb.done.body', { level, name: levelName })}
				</p>
				<p class="mt-2 text-sm text-muted">{t('onb.done.tip')}</p>
			{/if}
		</div>

		<div class="mt-6 flex items-center justify-between gap-2">
			<button
				class="rounded-lg border border-border bg-surface px-4 py-2 text-sm hover:bg-surface-2 disabled:invisible"
				disabled={index === 0}
				onclick={() => go(-1)}
			>
				{t('onb.back')}
			</button>
			{#if step === 'done'}
				<button
					class="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white"
					onclick={() => onFinish(level)}
				>
					{t('onb.done.go')}
				</button>
			{:else}
				<button
					class="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white"
					onclick={() => go(1)}
				>
					{step === 'welcome' ? t('onb.welcome.go') : t('onb.next')}
				</button>
			{/if}
		</div>
	</div>
</div>

{#if measuring}
	<RangeMeasure bind:low bind:high {getDetector} onClose={() => (measuring = false)} />
{/if}
{#if syncing}
	<SyncCalibration {getDetector} onClose={() => (syncing = false)} />
{/if}
{#if calibrating}
	<MicCalibration {getDetector} onClose={() => (calibrating = false)} />
{/if}
