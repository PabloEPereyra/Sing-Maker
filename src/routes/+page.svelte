<script lang="ts">
	import { onMount } from 'svelte';
	import GameStage from '$lib/components/GameStage.svelte';
	import RangePicker from '$lib/components/RangePicker.svelte';
	import CustomizeDialog from '$lib/components/CustomizeDialog.svelte';
	import CreateExerciseDialog from '$lib/components/CreateExerciseDialog.svelte';
	import VoiceExerciseDialog from '$lib/components/VoiceExerciseDialog.svelte';
	import { addMine, loadMine, mine, removeMine } from '$lib/exercises/mine.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import PopoverButton from '$lib/components/PopoverButton.svelte';
	import ProfileMenu from '$lib/components/ProfileMenu.svelte';
	import DrumControl from '$lib/components/DrumControl.svelte';
	import { byLevel, exercises, exerciseText } from '$lib/exercises/catalog';
	import { generateSequence } from '$lib/music/generate';
	import { getContext, loadDrums, loadPiano } from '$lib/audio/engine';
	import { patternsFor, type DrumPattern } from '$lib/audio/drums';
	import { addMyDrum, loadMyDrums, myDrums, removeMyDrum } from '$lib/audio/mydrums.svelte';
	import type { DrumResult } from '$lib/ai/drums';
	import { meterFamily, type MeterId } from '$lib/music/meter';
	import { PitchDetector } from '$lib/audio/pitch';
	import { autopilot, type GameOptions, type Phase } from '$lib/game/game';
	import { createSkyTheme } from '$lib/game/themes/sky';
	import { createPathTheme } from '$lib/game/themes/path';
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
	// Un tema por combinación de personaje y punto de partida, creado una sola vez. Los voladores
	// van al cielo (con árbol de partida); los terrestres, al sendero.
	const themes: Record<string, Theme> = {};
	function themeFor(character: CharacterId, start: StartId): Theme {
		if (character === 'bunny') return (themes.bunny ??= createPathTheme());
		const key = `${character}-${start}`;
		return (themes[key] ??= createSkyTheme(character, start));
	}

	let selectedId = $state(byLevel()[0].exercises[0].id);
	let low = $state(45); // A2 (tenor)
	let high = $state(72); // C5
	/** Tempo elegido (bpm). Al cambiar de ejercicio vuelve al del ejercicio, redondeado de a 5. */
	let bpm = $state(80);
	const BPM_MIN = 60;
	const BPM_MAX = 150;
	let guide = $state(true);
	/** Batería, con un patrón elegido para cada familia de compás; `/2` la pasa a la mitad de velocidad. */
	let drums = $state(false);
	let drumsHalf = $state(false);
	let drumPick = $state<Record<MeterId, string>>({ '4/4': 'basic-44', '6/8': 'basic-68' });
	let tolerance = $state(0.6);
	let demo = $state(true); // sin micrófono hasta que se active
	let micError = $state('');
	let search = $state('');
	let customizing = $state(false);
	let creating = $state(false);
	let creatingByVoice = $state(false);
	let loaded = $state(false);
	let phase = $state<Phase>('idle');

	let stage: GameStage;
	let detector: PitchDetector | null = null;

	const theme = $derived(themeFor(settings.character, settings.start));
	const running = $derived(phase === 'listen' || phase === 'countin' || phase === 'playing');
	const exercise = $derived(
		mine.list.find((e) => e.id === selectedId) ??
			exercises.find((e) => e.id === selectedId) ??
			exercises[0]
	);
	const text = $derived(exerciseText(exercise, settings.lang));
	$effect(() => {
		const own = exercise.parsed.meta.bpm;
		bpm = Math.max(BPM_MIN, Math.min(BPM_MAX, Math.round(own / 5) * 5));
	});
	const sequence = $derived(
		generateSequence(exercise.parsed.notes, {
			low,
			high,
			direction: exercise.parsed.meta.direction,
			bpm,
			beatsPerMeasure: exercise.parsed.meta.beatsPerMeasure,
			subdivision: exercise.parsed.meta.subdivision
		})
	);
	/** Familia de compás del ejercicio (4/4 o 6/8): define qué patrones de batería se ofrecen. */
	const meter = $derived(meterFamily(exercise.parsed.meta));
	/** Patrones de fábrica y los creados con IA para este compás. */
	const patterns = $derived<DrumPattern[]>([
		...patternsFor(meter),
		...myDrums.list.filter((p) => p.meter === meter)
	]);
	const customIds = $derived(new Set(myDrums.list.map((p) => p.id)));
	const drumPattern = $derived(patterns.find((p) => p.id === drumPick[meter]) ?? patterns[0]);
	const options: GameOptions = $derived({
		bpm,
		beatsPerMeasure: exercise.parsed.meta.beatsPerMeasure,
		subdivision: exercise.parsed.meta.subdivision,
		drums: drums ? drumPattern : null,
		drumsHalf,
		guide,
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
		loadMine();
		loadMyDrums();
		try {
			const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
			if (typeof p.low === 'number') low = p.low;
			if (typeof p.high === 'number') high = p.high;
			if (typeof p.guide === 'boolean') guide = p.guide;
			if (typeof p.drumsHalf === 'boolean') drumsHalf = p.drumsHalf;
			if (typeof p.drums === 'boolean') drums = p.drums;
			if (p.drumPick && typeof p.drumPick === 'object') drumPick = { ...drumPick, ...p.drumPick };
			if (drums) void loadDrums();
			if (typeof p.tolerance === 'number') tolerance = p.tolerance;
			if (typeof p.demo === 'boolean') demo = p.demo;
		} catch {}
		loaded = true;
		void loadPiano();
		return () => detector?.stop();
	});

	$effect(() => {
		const prefs = { low, high, guide, drums, drumsHalf, drumPick, tolerance, demo };
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

	/** Guarda el ejercicio creado con IA y lo deja listo para practicar. */
	function practiceCreated(code: string, prompt: string) {
		stop();
		selectedId = addMine(code, prompt).id;
		creating = false;
		creatingByVoice = false;
	}

	/** Guarda el patrón de batería creado con IA y lo deja sonando en el ejercicio. */
	function practiceDrum(result: DrumResult, patternMeter: MeterId) {
		stop();
		const pattern = addMyDrum(result, patternMeter);
		drumPick = { ...drumPick, [patternMeter]: pattern.id };
		drums = true;
		void loadDrums();
		creating = false;
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
			<div class="space-y-2 border-b border-border p-3">
				<div class="flex gap-2">
					<button
						class="flex-1 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110"
						onclick={() => (creating = true)}
					>
						✨ {t('create.button')}
					</button>
					<button
						class="flex-1 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm font-semibold text-accent hover:bg-accent/15"
						onclick={() => {
							stop();
							creatingByVoice = true;
						}}
					>
						🎤 {t('voice.button')}
					</button>
				</div>
				<input
					type="search"
					placeholder={t('catalog.search')}
					bind:value={search}
					class="w-full rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-accent"
				/>
			</div>
			<div class="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
				{#if mine.list.length && !query}
					<details class="group rounded-lg bg-accent/10" open>
						<summary
							class="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 select-none hover:bg-accent/15"
						>
							<span class="text-sm">✨</span>
							<span class="font-bold">{t('create.mine')}</span>
							<span class="ml-auto text-xs text-muted">{mine.list.length}</span>
							<span class="text-muted transition group-open:rotate-90">›</span>
						</summary>
						<div class="px-1 pb-2">
							{#each mine.list as e (e.id)}
								<div class="group/item flex items-center gap-1">
									<button
										class="block min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-left text-sm transition {e.id ===
										selectedId
											? 'bg-accent font-semibold text-white'
											: 'hover:bg-surface-2'}"
										title={e.parsed.meta.description}
										onclick={() => {
											stop();
											selectedId = e.id;
										}}
									>
										{exerciseText(e, settings.lang).name}
									</button>
									<button
										class="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted opacity-0 group-hover/item:opacity-100 hover:bg-surface-2 hover:text-red-600"
										aria-label={t('create.delete')}
										title={t('create.delete')}
										onclick={() => removeMine(e.id)}>✕</button
									>
								</div>
							{/each}
						</div>
					</details>
				{/if}
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
							min={BPM_MIN}
							max={BPM_MAX}
							step="5"
							bind:value={bpm}
							class="vx-slider w-full"
							style:--fill={fill(bpm, BPM_MIN, BPM_MAX)}
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
				<!-- Batería y su patrón, según el compás del ejercicio; /2 = a la mitad de velocidad -->
				<DrumControl
					enabled={drums}
					half={drumsHalf}
					{patterns}
					value={drumPattern.id}
					custom={customIds}
					onToggle={() => {
						drums = !drums;
						if (drums) void loadDrums();
					}}
					onPick={(id) => {
						drumPick = { ...drumPick, [meter]: id };
						drums = true;
						void loadDrums();
					}}
					onHalf={() => (drumsHalf = !drumsHalf)}
					onRemove={removeMyDrum}
				/>
			</div>
		</main>
	</div>
</div>

{#if creating}
	<CreateExerciseDialog
		range={{ low, high }}
		{meter}
		onPractice={practiceCreated}
		onDrum={practiceDrum}
		onClose={() => (creating = false)}
	/>
{/if}

{#if creatingByVoice}
	<VoiceExerciseDialog
		range={{ low, high }}
		getDetector={() => ensureMic()}
		onPractice={practiceCreated}
		onClose={() => (creatingByVoice = false)}
	/>
{/if}

{#if customizing}
	<CustomizeDialog onClose={() => (customizing = false)} />
{/if}
