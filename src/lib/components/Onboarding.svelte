<script lang="ts">
	// Guía de inicio paso a paso: micrófono, rango, retraso de la voz y una prueba de oído que
	// lleva a una prueba de nivel jugada que recomienda por dónde empezar. Cada paso reutiliza las pantallas de siempre (medir rango,
	// sincronizar, calibrar) y se puede saltar o repetir desde el menú de configuración.
	import { exercises } from '$lib/exercises/catalog';
	import { PASS_PERCENT, STAGES } from '$lib/exercises/placement';
	import type { PitchDetector } from '$lib/audio/pitch';
	import { DIFFICULTIES } from '$lib/game/difficulty';
	import { noteLabel, settings } from '$lib/settings.svelte';
	import { t } from '$lib/i18n';
	import { levelExercise, shortName } from '$lib/exercises/catalog';
	import DifficultyBadge from './DifficultyBadge.svelte';
	import HowToPlay from './HowToPlay.svelte';
	import MicCalibration from './MicCalibration.svelte';
	import RangeMeasure from './RangeMeasure.svelte';
	import SyncCalibration from './SyncCalibration.svelte';

	let {
		low = $bindable(),
		high = $bindable(),
		startStep = 'welcome',
		recommended = null,
		getDetector,
		onTest,
		onFinish,
		onClose
	}: {
		low: number;
		high: number;
		/** Paso con el que abre (al volver de la prueba de nivel se abre en el resultado). */
		startStep?: Step;
		/** Ejercicio que aconseja la prueba de nivel; sin prueba, el primero del nivel 1. */
		recommended?: string | null;
		getDetector: () => Promise<PitchDetector | null>;
		/** Pasa a la prueba de nivel jugada. */
		onTest: () => void;
		/** Termina la guía y deja elegido el ejercicio recomendado. */
		onFinish: (exerciseId: string | null) => void;
		onClose: () => void;
	} = $props();

	const STEPS = [
		'welcome',
		'mic',
		'range',
		'sync',
		'difficulty',
		'howto',
		'level',
		'done'
	] as const;
	type Step = (typeof STEPS)[number];

	// svelte-ignore state_referenced_locally
	let step = $state<Step>(startStep);
	let micOn = $state(false);
	let micFailed = $state(false);
	let measuring = $state(false);
	let syncing = $state(false);
	let calibrating = $state(false);

	const index = $derived(STEPS.indexOf(step));
	const pick = $derived(
		exercises.find((e) => e.id === recommended) ?? levelExercise('1', 1) ?? exercises[0]
	);
	const pickNumber = $derived(exercises.filter((e) => e.level === pick.level).indexOf(pick) + 1);

	async function activateMic() {
		micFailed = false;
		micOn = !!(await getDetector());
		micFailed = !micOn;
	}

	function go(delta: number) {
		step = STEPS[Math.max(0, Math.min(STEPS.length - 1, index + delta))];
	}
</script>

<svelte:window
	onkeydown={(e) => e.key === 'Escape' && !measuring && !syncing && !calibrating && onClose()}
/>

<div class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm">
	<div
		class="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden bg-surface text-fg"
		role="dialog"
		aria-modal="true"
		aria-labelledby="onb-title"
	>
		<div class="ribbon flex items-center justify-between gap-3 px-4 py-2.5">
			<span class="text-lg leading-tight">
				{t('onb.step', { n: index + 1, total: STEPS.length })}
			</span>
			<button class="text-sm underline opacity-90 hover:opacity-100" onclick={onClose}>
				{t('onb.skip')}
			</button>
		</div>
		<div class="min-h-0 flex-1 overflow-y-auto p-5">
			<div class="flex gap-1" aria-hidden="true">
				{#each STEPS as s, i (s)}
					<span class="h-2 flex-1 rounded-full {i <= index ? 'bg-accent' : 'bg-surface-2'}"></span>
				{/each}
			</div>

			<div class="mt-5">
				{#if step === 'welcome'}
					<h2 id="onb-title" class="text-xl font-bold">{t('onb.welcome.title')}</h2>
					<p class="mt-2 text-sm text-muted">{t('onb.welcome.body')}</p>
					<div class="mt-4 text-sm text-muted">{t('header.language')}</div>
					<div class="pill-group mt-1 !h-9 w-full" role="group" aria-label={t('header.language')}>
						{#each ['es', 'en'] as const as lang (lang)}
							<button
								class="flex-1 px-1 text-xs font-semibold uppercase transition {settings.lang ===
								lang
									? 'bg-accent text-white'
									: 'hover:bg-surface-2'}"
								aria-pressed={settings.lang === lang}
								onclick={() => (settings.lang = lang)}
							>
								{lang}
							</button>
						{/each}
					</div>
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
					<p class="mt-4 text-xs text-muted">{t('onb.mic.later')}</p>
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
				{:else if step === 'difficulty'}
					<h2 id="onb-title" class="text-xl font-bold">{t('onb.diff.title')}</h2>
					<p class="mt-2 text-sm text-muted">{t('onb.diff.body')}</p>
					<div class="pill-group mt-4 !h-14 w-full" role="group" aria-label={t('diff.title')}>
						{#each DIFFICULTIES as d (d.id)}
							<button
								class="flex flex-1 flex-col items-center justify-center gap-0.5 px-1 text-xs font-semibold transition {settings.difficulty ===
								d.id
									? 'bg-accent text-white'
									: 'hover:bg-surface-2'}"
								aria-pressed={settings.difficulty === d.id}
								onclick={() => (settings.difficulty = d.id)}
							>
								<DifficultyBadge level={d.id} class="h-5 w-5" />
								{t(`diff.${d.id}`)}
							</button>
						{/each}
					</div>
					<p class="mt-2 text-xs text-muted">
						{t('diff.help', {
							cents: DIFFICULTIES.find((d) => d.id === settings.difficulty)?.cents ?? 75
						})}
					</p>
				{:else if step === 'howto'}
					<h2 id="onb-title" class="text-xl font-bold">{t('how.title')}</h2>
					<p class="mt-2 text-sm text-muted">{t('how.intro')}</p>
					<HowToPlay />
				{:else if step === 'level'}
					<h2 id="onb-title" class="text-xl font-bold">{t('onb.level.title')}</h2>
					<p class="mt-2 text-sm text-muted">
						{t('onb.level.body', { pass: PASS_PERCENT, total: STAGES })}
					</p>
					<div class="mt-4">
						<button
							class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
							onclick={onTest}
						>
							{t('onb.level.start')}
						</button>
					</div>
				{:else}
					<h2 id="onb-title" class="text-xl font-bold">{t('onb.done.title')}</h2>
					<p class="mt-2 font-semibold text-accent">
						{t('onb.done.body', {
							n: pickNumber,
							name: shortName(pick, settings.lang),
							level: pick.level
						})}
					</p>
					<p class="mt-2 text-sm text-muted">{t('onb.done.tip')}</p>
					<p class="mt-2 text-sm text-muted">{t('onb.done.menu')}</p>
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
						onclick={() => onFinish(pick.id)}
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
</div>

{#if measuring}
	<RangeMeasure
		bind:low
		bind:high
		{getDetector}
		onClose={() => (measuring = false)}
		onNext={() => {
			measuring = false;
			go(1);
		}}
	/>
{/if}
{#if syncing}
	<SyncCalibration
		{getDetector}
		onClose={() => (syncing = false)}
		onNext={() => {
			syncing = false;
			go(1);
		}}
	/>
{/if}
{#if calibrating}
	<MicCalibration
		{getDetector}
		onClose={() => (calibrating = false)}
		onNext={() => {
			calibrating = false;
			go(1);
		}}
	/>
{/if}
