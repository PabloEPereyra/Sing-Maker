<script lang="ts">
	import { onMount } from 'svelte';
	import GameStage from '$lib/components/GameStage.svelte';
	import RangePicker from '$lib/components/RangePicker.svelte';
	import CustomizeDialog from '$lib/components/CustomizeDialog.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import PopoverButton from '$lib/components/PopoverButton.svelte';
	import ProfileMenu from '$lib/components/ProfileMenu.svelte';
	import { byLevel, exercises, exerciseText } from '$lib/exercises/catalog';
	import { generateSequence } from '$lib/music/generate';
	import { getContext, loadPiano } from '$lib/audio/engine';
	import { PitchDetector } from '$lib/audio/pitch';
	import { autopilot, type GameOptions, type Phase } from '$lib/game/game';
	import { createSkyTheme } from '$lib/game/themes/sky';
	import {
		loadSettings,
		saveSettings,
		settings,
		type CharacterId,
		type StartId
	} from '$lib/settings.svelte';
	import type { Theme } from '$lib/game/theme';
	import { t, tDynamic } from '$lib/i18n';

	const PREFS_KEY = 'singmaker-prefs';
	// Un tema por combinación de personaje y punto de partida, creado una sola vez.
	const themes: Record<string, Theme> = {};
	function themeFor(character: CharacterId, start: StartId): Theme {
		const key = `${character}-${start}`;
		return (themes[key] ??= createSkyTheme(character, start));
	}

	let selectedId = $state(byLevel()[0].exercises[0].id);
	let low = $state(45); // A2 (tenor)
	let high = $state(72); // C5
	let tempo = $state(1); // multiplicador sobre el bpm del ejercicio
	let guide = $state(true);
	let metronome = $state(false);
	let tolerance = $state(0.6);
	let demo = $state(true); // sin micrófono hasta que se active
	let micError = $state('');
	let search = $state('');
	let customizing = $state(false);
	let loaded = $state(false);
	let phase = $state<Phase>('idle');

	let stage: GameStage;
	let detector: PitchDetector | null = null;

	const theme = $derived(themeFor(settings.character, settings.start));
	const running = $derived(phase === 'countin' || phase === 'playing');
	const exercise = $derived(exercises.find((e) => e.id === selectedId) ?? exercises[0]);
	const text = $derived(exerciseText(exercise, settings.lang));
	const bpm = $derived(Math.round(exercise.parsed.meta.bpm * tempo));
	const sequence = $derived(
		generateSequence(exercise.parsed.notes, {
			low,
			high,
			direction: exercise.parsed.meta.direction,
			bpm,
			beatsPerMeasure: exercise.parsed.meta.beatsPerMeasure
		})
	);
	const options: GameOptions = $derived({
		bpm,
		beatsPerMeasure: exercise.parsed.meta.beatsPerMeasure,
		guide,
		metronome,
		tolerance
	});
	const query = $derived(search.trim().toLowerCase());
	const levels = $derived(
		byLevel(
			query
				? exercises.filter((e) =>
						[e.name, e.name_en, e.category, e.parsed.meta.description, e.description_en]
							.join(' ')
							.toLowerCase()
							.includes(query)
					)
				: exercises
		)
	);

	onMount(() => {
		loadSettings();
		try {
			const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
			if (typeof p.low === 'number') low = p.low;
			if (typeof p.high === 'number') high = p.high;
			if (typeof p.guide === 'boolean') guide = p.guide;
			if (typeof p.metronome === 'boolean') metronome = p.metronome;
			if (typeof p.tolerance === 'number') tolerance = p.tolerance;
			if (typeof p.demo === 'boolean') demo = p.demo;
		} catch {}
		loaded = true;
		void loadPiano();
		return () => detector?.stop();
	});

	$effect(() => {
		const prefs = { low, high, guide, metronome, tolerance, demo };
		if (!loaded) return;
		try {
			localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
		} catch {}
	});

	$effect(() => {
		const snapshot = { ...settings };
		document.documentElement.lang = snapshot.lang;
		if (loaded) saveSettings();
	});

	/** Abre el micrófono (una vez) y mide el ruido ambiente. */
	async function ensureMic(forceCalibration = false): Promise<PitchDetector | null> {
		micError = '';
		try {
			if (!detector?.active) {
				detector = new PitchDetector(getContext());
				await detector.start();
				forceCalibration = true;
			}
		} catch {
			micError = t('mic.error');
			return null;
		}
		if (forceCalibration) {
			await detector.calibrate();
		}
		return detector;
	}

	async function start() {
		getContext();
		// Esperar el piano como mucho 1,5 s; si no llegó, suena el sintetizador.
		await Promise.race([loadPiano(), new Promise((r) => setTimeout(r, 1500))]);
		if (demo) {
			stage.play(autopilot(sequence), 0);
			return;
		}
		const d = await ensureMic();
		if (!d) return;
		stage.play(() => d.read().midi, d.latency);
	}

	/** Play/pausa: arranca, pausa o retoma sin volver a empezar. */
	function togglePlay() {
		if (running) stage.pause();
		else if (phase === 'paused') stage.resume();
		else void start();
	}

	function stop() {
		stage.stop();
	}

	/** Botón de micrófono: encendido = cantar; apagado = modo demostración. */
	/** La calibración necesita el micrófono: sale del modo demostración si hacía falta. */
	async function micForCalibration(): Promise<PitchDetector | null> {
		if (demo) {
			stop();
			demo = false;
		}
		const d = await ensureMic();
		if (!d) demo = true;
		return d;
	}

	async function toggleMic() {
		stop();
		if (demo) {
			demo = false;
			if (!(await ensureMic(true))) demo = true;
		} else {
			demo = true;
			detector?.stop();
			detector = null;
		}
	}

	function next() {
		// Mismo orden que la lista: nivel → categoría.
		const order = byLevel().flatMap((lv) => lv.categories.flatMap(([, list]) => list));
		const i = order.findIndex((e) => e.id === selectedId);
		selectedId = order[(i + 1) % order.length].id;
	}

	/** Porcentaje de relleno de un slider (estilo Voicexplorer). */
	function fill(value: number, min: number, max: number): string {
		return `${((value - min) / (max - min)) * 100}%`;
	}
</script>

<div class="flex h-dvh flex-col">
	<header class="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
		<div class="flex items-center gap-3">
			<img src="/logo.png" alt="" class="-my-1 h-11 w-11" />
			<div>
				<h1 class="text-lg leading-tight font-black">Sing Maker</h1>
				<p class="text-xs text-muted">{t('app.subtitle')}</p>
			</div>
		</div>
		<div class="flex flex-wrap items-center justify-end gap-2 text-sm text-muted">
			<RangePicker bind:low bind:high getDetector={() => ensureMic()} />
			<button
				class="flex h-10 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 hover:bg-surface-2"
				onclick={() => (customizing = true)}
			>
				<Icon name="palette" class="h-4 w-4 text-accent" />
				{t('header.customize')}
			</button>
			<div
				class="flex h-10 overflow-hidden rounded-lg border border-border bg-surface"
				role="group"
				aria-label={t('header.language')}
			>
				{#each ['es', 'en'] as const as lang (lang)}
					<button
						class="rounded-none px-2.5 text-xs font-bold uppercase transition {settings.lang ===
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
			<button
				class="grid h-10 w-10 place-items-center rounded-full border transition {demo
					? 'border-border bg-surface text-muted hover:border-accent/50'
					: 'border-accent bg-accent text-white'}"
				aria-pressed={!demo}
				aria-label={demo ? t('mic.off') : t('mic.on')}
				title={demo ? t('mic.off') : t('mic.on')}
				onclick={toggleMic}
			>
				<Icon name="mic" class="h-5 w-5" />
			</button>
			<ProfileMenu getDetector={micForCalibration} />
		</div>
	</header>

	{#if micError}
		<div
			role="alert"
			class="mx-3 mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
		>
			{micError}
		</div>
	{/if}

	<div class="flex min-h-0 flex-1 flex-col gap-3 p-3 lg:flex-row">
		<!-- Catálogo -->
		<aside
			class="flex max-h-64 min-h-0 flex-col rounded-lg border border-border bg-surface lg:max-h-none lg:w-72"
		>
			<div class="border-b border-border p-3">
				<input
					type="search"
					placeholder={t('catalog.search')}
					bind:value={search}
					class="w-full rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-accent"
				/>
			</div>
			<div class="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
				{#each levels as lv (lv.level)}
					<details
						class="group rounded-lg bg-surface-2/60"
						open={!!query || lv.exercises.some((e) => e.id === selectedId)}
					>
						<summary
							class="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 select-none hover:bg-surface-2"
						>
							<span
								class="h-3 w-3 shrink-0 rounded-full border border-black/20"
								style:background={lv.color}
							></span>
							<span class="font-bold">{t('catalog.level')} {lv.level}</span>
							<span class="text-sm text-muted">· {tDynamic(`level.${lv.level}`, lv.name)}</span>
							<span class="ml-auto text-xs text-muted">{lv.exercises.length}</span>
							<span class="text-muted transition group-open:rotate-90">›</span>
						</summary>
						<div class="px-1 pb-2">
							{#each lv.categories as [category, list] (category)}
								<div
									class="px-2 pt-2 pb-0.5 text-[11px] font-bold tracking-wide text-muted uppercase"
								>
									{tDynamic(`category.${category}`, category)}
								</div>
								{#each list as e (e.id)}
									<button
										class="block w-full rounded-lg px-2 py-1.5 text-left text-sm transition {e.id ===
										selectedId
											? 'bg-accent font-semibold text-white'
											: 'hover:bg-surface-2'}"
										onclick={() => {
											stop();
											selectedId = e.id;
										}}
									>
										{exerciseText(e, settings.lang).name}
									</button>
								{/each}
							{/each}
						</div>
					</details>
				{/each}
			</div>
		</aside>

		<!-- Escena -->
		<main class="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
			<div class="min-h-[320px] flex-1">
				<GameStage
					bind:this={stage}
					{theme}
					{sequence}
					{options}
					title={text.name}
					{demo}
					bind:phase
					onStart={start}
					onNext={next}
				/>
			</div>

			<!-- Controles: todos centrados; tempo y tolerancia a la izquierda, piano y metrónomo a la derecha -->
			<div
				class="flex items-center justify-center gap-2 rounded-lg border border-border bg-surface p-3 text-sm sm:gap-3"
			>
				<PopoverButton icon="gauge" label="{t('controls.tempo')} · {bpm} bpm">
					<label class="block">
						<span class="mb-2 block text-xs text-muted">{t('controls.tempo')} · {bpm} bpm</span>
						<input
							type="range"
							min="0.5"
							max="1.5"
							step="0.05"
							bind:value={tempo}
							class="vx-slider w-full"
							style:--fill={fill(tempo, 0.5, 1.5)}
						/>
					</label>
				</PopoverButton>
				<PopoverButton icon="ruler" label="{t('controls.tolerance')} · ±{tolerance.toFixed(1)} st">
					<label class="block">
						<span class="mb-2 block text-xs text-muted"
							>{t('controls.tolerance')} · ±{tolerance.toFixed(1)} st</span
						>
						<input
							type="range"
							min="0.3"
							max="1.5"
							step="0.1"
							bind:value={tolerance}
							class="vx-slider w-full"
							style:--fill={fill(tolerance, 0.3, 1.5)}
						/>
					</label>
				</PopoverButton>

				<button
					class="grid h-12 w-12 place-items-center rounded-full border border-border bg-surface-2 text-fg hover:bg-border"
					aria-label={t('controls.stop')}
					title={t('controls.stop')}
					onclick={stop}
				>
					<Icon name="stop" class="h-5 w-5" />
				</button>
				<button
					class="grid h-14 w-14 place-items-center rounded-full bg-accent text-white shadow hover:brightness-110"
					aria-label={running
						? t('controls.pause')
						: phase === 'paused'
							? t('controls.resume')
							: t('controls.play')}
					title={running
						? t('controls.pause')
						: phase === 'paused'
							? t('controls.resume')
							: t('controls.play')}
					onclick={togglePlay}
				>
					{#if running}
						<Icon name="pause" class="h-6 w-6" />
					{:else}
						<Icon name="play" class="ml-0.5 h-7 w-7" />
					{/if}
				</button>

				<button
					class="grid h-11 w-11 place-items-center rounded-full border transition {guide
						? 'border-accent bg-accent text-white'
						: 'border-border bg-surface text-muted hover:border-accent/50'}"
					aria-pressed={guide}
					aria-label={t('controls.guide')}
					title={t('controls.guide')}
					onclick={() => (guide = !guide)}
				>
					<Icon name="piano" class="h-5 w-5" />
				</button>
				<button
					class="grid h-11 w-11 place-items-center rounded-full border transition {metronome
						? 'border-accent bg-accent text-white'
						: 'border-border bg-surface text-muted hover:border-accent/50'}"
					aria-pressed={metronome}
					aria-label={t('controls.metronome')}
					title={t('controls.metronome')}
					onclick={() => (metronome = !metronome)}
				>
					<Icon name="metronome" class="h-5 w-5" />
				</button>
			</div>
		</main>
	</div>
</div>

{#if customizing}
	<CustomizeDialog onClose={() => (customizing = false)} />
{/if}
