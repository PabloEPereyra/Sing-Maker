<script lang="ts">
	import { onMount } from 'svelte';
	import GameStage from '$lib/components/GameStage.svelte';
	import RangePicker from '$lib/components/RangePicker.svelte';
	import Onboarding from '$lib/components/Onboarding.svelte';
	import TipBubble from '$lib/components/TipBubble.svelte';
	import CustomizeDialog from '$lib/components/CustomizeDialog.svelte';
	import CreateExerciseDialog from '$lib/components/CreateExerciseDialog.svelte';
	import VoiceExerciseDialog from '$lib/components/VoiceExerciseDialog.svelte';
	import { addMine, loadMine, mine, removeMine } from '$lib/exercises/mine.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import PopoverButton from '$lib/components/PopoverButton.svelte';
	import ProfileMenu from '$lib/components/ProfileMenu.svelte';
	import DrumControl from '$lib/components/DrumControl.svelte';
	import { byLevel, exercises, exerciseText, library, shortName } from '$lib/exercises/catalog';
	import {
		KEYS_PER_STAGE,
		outcome,
		PASS_PERCENT,
		stageExercise,
		STAGES
	} from '$lib/exercises/placement';
	import { loadUnlocked, unlock, unlockedExercises } from '$lib/exercises/unlocked.svelte';
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
	import { createCustomTheme } from '$lib/game/themes/custom';
	import { withScene } from '$lib/game/themes/scene';
	import { findScene, loadAssets } from '$lib/character/assets.svelte';
	import {
		CUSTOM_PREFIX,
		findCharacter,
		isCustomId,
		loadCharacters
	} from '$lib/character/store.svelte';
	import { loadSettings, saveSettings, settings, type CharacterId } from '$lib/settings.svelte';
	import type { Theme } from '$lib/game/theme';
	import { loadTips, markAllSeen, markSeen, nextTip, recordDone } from '$lib/tips.svelte';
	import { t, tDynamic } from '$lib/i18n';

	/** Tempo con el que arranca cada ejercicio. */
	const DEFAULT_BPM = 90;
	const PREFS_KEY = 'singmaker-prefs';
	const ONBOARDED_KEY = 'singmaker-onboarded';
	// Un tema por personaje, creado una sola vez. Los voladores van al cielo; los terrestres, al sendero.
	const themes: Record<string, Theme> = {};
	function themeFor(character: CharacterId): Theme {
		if (isCustomId(character)) {
			// Personaje creado con IA: se arma cuando carga la lista guardada; mientras tanto, el pájaro.
			const rec = findCharacter(character.slice(CUSTOM_PREFIX.length));
			if (rec) return (themes[character] ??= createCustomTheme(rec));
			return (themes.bird ??= createSkyTheme('bird'));
		}
		if (character === 'bunny') return (themes.bunny ??= createPathTheme());
		return (themes[character] ??= createSkyTheme(character));
	}

	/** Texto legible sobre el color de cinturón del nivel (blanco, amarillo… o negro). */
	function ink(hex: string): string {
		const n = parseInt(hex.slice(1), 16);
		const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
		return lum > 0.6 ? '#1b2240' : '#fff';
	}
	let selectedId = $state(byLevel()[0].exercises[0].id);
	let low = $state(45); // A2 (tenor)
	let high = $state(72); // C5
	/** Tempo elegido (bpm). Al cambiar de ejercicio vuelve al tempo por defecto. */
	let bpm = $state(DEFAULT_BPM);
	const BPM_MIN = 60;
	const BPM_MAX = 150;
	let guide = $state(true);
	/** Batería, con un patrón elegido para cada familia de compás; `/2` la pasa a la mitad de velocidad. */
	let drums = $state(false);
	let drumsHalf = $state(false);
	/** Al terminar un ejercicio: la voz parece desfasada (se señala el menú de configuración). */
	let desync = $state(false);
	let drumPick = $state<Record<MeterId, string>>({ '4/4': 'basic-44', '6/8': 'basic-68' });
	let tolerance = $state(0.6);
	let demo = $state(true); // sin micrófono hasta que se active
	let micError = $state('');
	let search = $state('');
	let customizing = $state(false);
	let creating = $state(false);
	let creatingByVoice = $state(false);
	/** Descripción sugerida por el entrenador de IA para abrir el creador con el texto escrito. */
	let suggestedPrompt = $state('');
	/** Guía de inicio: se abre sola la primera vez y se repite desde el menú de configuración. */
	let onboarding = $state(false);
	/** Paso con el que abre la guía y ejercicio que recomienda tras la prueba de nivel. */
	let onboardingStep = $state<'welcome' | 'level' | 'done'>('welcome');
	let recommended = $state<string | null>(null);
	/** Prueba de nivel en curso: la etapa que se juega (0 a 3). */
	let placement = $state<{ stage: number } | null>(null);
	let loaded = $state(false);
	let phase = $state<Phase>('idle');

	let stage: GameStage;
	let detector: PitchDetector | null = null;

	/** El tema del personaje elegido, con el fondo propio que se haya elegido para su tipo (si hay). */
	const theme = $derived.by(() => {
		const base = themeFor(settings.character);
		const id = base.movement === 'walk' ? settings.backgroundWalk : settings.backgroundFly;
		const scene = id ? findScene(id) : undefined;
		return scene ? withScene(base, scene) : base;
	});
	const running = $derived(phase === 'listen' || phase === 'countin' || phase === 'playing');
	/** Lo que se ve en la lista: el catálogo y los ejercicios de la biblioteca ya desbloqueados. */
	const visible = $derived([...exercises, ...unlockedExercises()]);
	const exercise = $derived(
		mine.list.find((e) => e.id === selectedId) ??
			visible.find((e) => e.id === selectedId) ??
			exercises[0]
	);
	const text = $derived(exerciseText(exercise, settings.lang));
	$effect(() => {
		// Depende del ejercicio elegido: cada vez que cambia, el tempo vuelve al por defecto.
		void exercise.id;
		bpm = DEFAULT_BPM;
	});
	const sequence = $derived(
		generateSequence(exercise.parsed.notes, {
			low,
			high,
			direction: exercise.parsed.meta.direction,
			bpm,
			beatsPerMeasure: exercise.parsed.meta.beatsPerMeasure,
			subdivision: exercise.parsed.meta.subdivision,
			spread: placement ? KEYS_PER_STAGE : undefined
		})
	);
	/** Familia de compás del ejercicio (4/4 o 6/8): define qué patrones de batería se ofrecen. */
	const meter = $derived(meterFamily(exercise.parsed.meta));
	/** Patrones de fábrica y los creados con IA para este compás. */
	const patterns = $derived<DrumPattern[]>([
		...patternsFor(meter),
		...myDrums.list.filter((p) => p.meter === meter)
	]);
	const builtinPatterns = $derived(patternsFor(meter));
	const minePatterns = $derived(myDrums.list.filter((p) => p.meter === meter));
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
				? visible.filter((e) =>
						[e.name, e.name_en, e.category, e.parsed.meta.description, e.description_en]
							.join(' ')
							.toLowerCase()
							.includes(query)
					)
				: visible
		)
	);

	onMount(() => {
		loadSettings();
		loadMine();
		loadUnlocked();
		loadTips();

		loadMyDrums();
		void loadCharacters();
		void loadAssets();
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
		try {
			onboarding = !localStorage.getItem(ONBOARDED_KEY);
		} catch {}
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

	// Pistas: se cuenta cada ejercicio terminado (fuera de la prueba de nivel) y, en reposo y sin
	// diálogos abiertos, se muestra la próxima que corresponda.
	let lastPhase: Phase = 'idle';
	$effect(() => {
		const now = phase;
		if (now === 'done' && lastPhase !== 'done' && !placement) recordDone();
		lastPhase = now;
	});
	const tip = $derived(
		loaded &&
			phase === 'idle' &&
			!onboarding &&
			!placement &&
			!creating &&
			!creatingByVoice &&
			!customizing
			? nextTip()
			: undefined
	);

	function closeOnboarding() {
		onboarding = false;
		try {
			localStorage.setItem(ONBOARDED_KEY, '1');
		} catch {}
	}

	function openOnboarding(step: 'welcome' | 'level' | 'done' = 'welcome') {
		stop();
		onboardingStep = step;
		onboarding = true;
	}

	/** Termina la guía: deja seleccionado el ejercicio recomendado. */
	function finishOnboarding(id: string | null) {
		closeOnboarding();
		recommended = null;
		const pick = visible.find((e) => e.id === id);
		if (pick) {
			stop();
			selectedId = pick.id;
		}
	}

	/** Empieza la prueba de nivel: se canta de verdad, etapa por etapa. */
	async function startPlacement() {
		onboarding = false;
		stop();
		if (!(await micForCalibration())) return openOnboarding('level');
		placement = { stage: 0 };
		selectedId = stageExercise(0).id;
	}

	function exitPlacement() {
		stop();
		placement = null;
		openOnboarding('level');
	}

	/** Después de jugar una etapa: la siguiente, o el resultado con el ejercicio donde empezar. */
	function advancePlacement(pct: number) {
		if (!placement) return;
		const result = outcome(placement.stage, pct);
		if (result.startAt) {
			placement = null;
			recommended = result.startAt.id;
			openOnboarding('done');
		} else {
			placement = { stage: placement.stage + 1 };
			selectedId = stageExercise(placement.stage).id;
		}
	}

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
		stage.play(() => d.read().midi, d.latency + settings.latencyMs / 1000);
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
		suggestedPrompt = '';
	}

	/** Elige el ritmo de la lista y enciende la batería. */
	/** Devolución del entrenador de IA: qué se practicó y entre qué ejercicios puede recomendar. */
	const coach = $derived({
		exercise: {
			id: exercise.id,
			name: text.name,
			level: exercise.level === 'mine' ? 'custom' : exercise.level,
			category: exercise.category === 'mine' ? 'custom' : exercise.category
		},
		// Del catálogo visible y de la biblioteca oculta, cerca del nivel actual (uno menos o hasta dos más).
		candidates: [...visible, ...library.filter((e) => !visible.some((v) => v.id === e.id))]
			.filter((e) => {
				if (e.id === exercise.id) return false;
				const here = Number(exercise.level);
				return Number.isFinite(here)
					? Number(e.level) >= here - 1 && Number(e.level) <= here + 2
					: true;
			})
			.map((e) => {
				const x = exerciseText(e, settings.lang);
				return {
					id: e.id,
					name: x.name,
					level: e.level,
					category: e.category,
					description: x.description.slice(0, 140)
				};
			}),
		onPick: (id: string) => {
			stop();
			unlock(id);
			selectedId = id;
		},
		onCreate: (prompt: string) => {
			stop();
			suggestedPrompt = prompt;
			creating = true;
		}
	});

	function pickRhythm(id: string) {
		drumPick = { ...drumPick, [meter]: id };
		drums = true;
		void loadDrums();
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
		const order = byLevel(visible).flatMap((lv) => lv.exercises);
		const i = order.findIndex((e) => e.id === selectedId);
		selectedId = order[(i + 1) % order.length].id;
	}

	/** Porcentaje de relleno de un slider (estilo Voicexplorer). */
	function fill(value: number, min: number, max: number): string {
		return `${((value - min) / (max - min)) * 100}%`;
	}
</script>

<!-- Fin de cada etapa de la prueba de nivel: resultado y paso siguiente -->
{#snippet placementDone(pct: number)}
	{#if placement}
		{@const result = outcome(placement.stage, pct)}
		<div class="text-sm text-muted uppercase">
			{t('place.stage', { n: placement.stage + 1, total: STAGES })}
		</div>
		<div
			class="mx-auto my-3 flex max-w-xs items-center gap-3"
			role="progressbar"
			aria-valuemin="0"
			aria-valuemax="100"
			aria-valuenow={pct}
		>
			<div class="h-3 flex-1 overflow-hidden rounded-full bg-surface-2">
				<div class="h-full rounded-full bg-accent" style:width="{pct}%"></div>
			</div>
			<span class="w-12 text-right text-lg font-bold tabular-nums">{pct}%</span>
		</div>
		<p class="mb-5 font-semibold {result.passed ? 'text-accent' : ''}">
			{result.passed
				? result.startAt
					? t('place.passedAll')
					: t('place.passed')
				: t('place.failed', { pass: PASS_PERCENT })}
		</p>
		<div class="flex justify-center gap-3">
			<button
				class="flex items-center gap-1.5 rounded-lg bg-surface-2 px-5 py-2 font-semibold hover:bg-border"
				onclick={start}
			>
				<Icon name="retry" class="h-4 w-4" />
				{t('stage.retry')}
			</button>
			<button
				class="rounded-lg bg-accent px-5 py-2 font-bold text-white hover:brightness-105"
				onclick={() => advancePlacement(pct)}
			>
				{result.startAt ? t('place.result') : t('place.next')} →
			</button>
		</div>
	{/if}
{/snippet}

<!-- Fila de la lista de ritmos: elegir el patrón (y encender la batería); los creados se pueden borrar -->
{#snippet rhythmRow(p: DrumPattern, removable: boolean)}
	<div class="group/item flex items-center gap-1">
		<button
			class="block min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-left text-sm transition {p.id ===
			drumPattern.id
				? 'bg-accent font-semibold text-white'
				: 'hover:bg-surface-2'}"
			aria-pressed={p.id === drumPattern.id}
			onclick={() => pickRhythm(p.id)}>{p.name}</button
		>
		{#if removable}
			<button
				class="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted opacity-0 group-hover/item:opacity-100 hover:bg-surface-2 hover:text-red-600 focus-visible:opacity-100"
				aria-label={t('create.delete')}
				title={t('create.delete')}
				onclick={() => removeMyDrum(p.id)}>✕</button
			>
		{/if}
	</div>
{/snippet}

<div class="flex h-dvh flex-col">
	<header class="bar flex items-center justify-between gap-3 px-4 py-2.5">
		<div class="flex items-center gap-3">
			<img src="/logo.png" alt="" class="-my-1 h-12 w-12 drop-shadow-md" />
			<div>
				<h1 class="logo-text text-2xl leading-tight font-bold">Sing Maker</h1>
				<p class="text-xs text-muted">{t('app.subtitle')}</p>
			</div>
		</div>
		<div class="flex flex-wrap items-center justify-end gap-2 text-sm text-muted">
			<RangePicker bind:low bind:high getDetector={() => ensureMic()} />
			<button
				class="round-btn gap-1.5 sm:w-auto sm:px-4"
				title={t('header.customize')}
				aria-label={t('header.customize')}
				data-tip="customize"
				onclick={() => (customizing = true)}
			>
				<Icon name="palette" class="h-5 w-5 text-accent" />
				<span class="hidden font-display font-semibold sm:inline">{t('header.customize')}</span>
			</button>
			<div class="pill-group" role="group" aria-label={t('header.language')}>
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
				class="round-btn {demo ? 'text-muted' : 'round-btn-on'}"
				aria-pressed={!demo}
				aria-label={demo ? t('mic.off') : t('mic.on')}
				title={demo ? t('mic.off') : t('mic.on')}
				onclick={toggleMic}
			>
				<Icon name="mic" class="h-5 w-5" />
			</button>
			<ProfileMenu
				getDetector={micForCalibration}
				bind:highlight={desync}
				onGuide={() => openOnboarding()}
			/>
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
		<aside class="panel flex max-h-64 min-h-0 flex-col lg:max-h-none lg:w-72" inert={!!placement}>
			<div class="space-y-2 border-b border-border p-3">
				<div class="flex gap-2">
					<button
						class="flex-1 rounded-lg bg-accent px-2 py-2 text-sm font-semibold whitespace-nowrap text-white hover:brightness-110"
						data-tip="create"
						onclick={() => (creating = true)}
					>
						✨ {t('create.button')}
					</button>
					<button
						class="flex-1 rounded-lg border-2 border-accent/40 bg-accent/10 px-2 py-2 font-display text-sm font-semibold whitespace-nowrap text-accent hover:bg-accent/15"
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
				{#if !query}
					<details class="group rounded-lg bg-surface-2/60">
						<summary
							class="flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 select-none hover:bg-surface-2"
						>
							<Icon name="drum" class="h-4 w-4 shrink-0 text-accent" />
							<span class="font-bold">{t('rhythms.title')}</span>
							<span class="text-sm text-muted">· {meter}</span>
							<span class="ml-auto truncate text-xs text-muted">{drumPattern.name}</span>
							<span class="text-muted transition group-open:rotate-90">›</span>
						</summary>
						<div class="px-1 pb-2">
							<div
								class="px-2 pt-2 pb-0.5 text-[11px] font-bold tracking-wide text-muted uppercase"
							>
								{t('rhythms.builtin')}
							</div>
							{#each builtinPatterns as p (p.id)}{@render rhythmRow(p, false)}{/each}
							{#if minePatterns.length}
								<div
									class="px-2 pt-2 pb-0.5 text-[11px] font-bold tracking-wide text-muted uppercase"
								>
									✨ {t('rhythms.mine')}
								</div>
								{#each minePatterns as p (p.id)}{@render rhythmRow(p, true)}{/each}
							{/if}
						</div>
					</details>
				{/if}
				{#each levels as lv (lv.level)}
					<details
						class="group level-card"
						open={!!query || lv.exercises.some((e) => e.id === selectedId)}
					>
						<summary
							class="ribbon flex cursor-pointer list-none items-center gap-2 px-3 py-2 select-none"
							style:--ribbon={lv.color}
							style:--ribbon-fg={ink(lv.color)}
						>
							<span class="ribbon-dot" aria-hidden="true">{lv.level}</span>
							<span class="font-bold">{t('catalog.level')} {lv.level}</span>
							<span class="truncate text-sm font-semibold"
								>{tDynamic(`level.${lv.level}`, lv.name)}</span
							>
							<span class="ml-auto rounded-full bg-black/15 px-2 text-xs font-bold"
								>{lv.exercises.length}</span
							>
							<span class="transition group-open:rotate-90">›</span>
						</summary>
						<div class="px-1 pb-2">
							{#each lv.exercises as e, i (e.id)}
								<button
									class="ex-card flex items-center gap-2 {e.id === selectedId ? 'ex-card-on' : ''}"
									aria-current={e.id === selectedId}
									onclick={() => {
										stop();
										selectedId = e.id;
									}}
								>
									<span class="ex-num" aria-hidden="true">{i + 1}</span>
									<span class="min-w-0 flex-1">{shortName(e, settings.lang)}</span>
								</button>
							{/each}
						</div>
					</details>
				{/each}
			</div>
		</aside>

		<!-- Escena -->
		<main class="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
			{#if placement}
				<div class="panel flex items-center gap-3 px-4 py-2 text-sm">
					<span class="font-display font-bold text-accent">
						{t('place.banner', { n: placement.stage + 1, total: STAGES, pass: PASS_PERCENT })}
					</span>
					<span class="min-w-0 flex-1 truncate text-muted">{text.name}</span>
					<button
						class="shrink-0 rounded-lg border border-border bg-surface px-3 py-1 text-xs hover:bg-surface-2"
						onclick={exitPlacement}
					>
						{t('place.exit')}
					</button>
				</div>
			{/if}
			<div class="min-h-[320px] flex-1">
				<GameStage
					bind:this={stage}
					{theme}
					{sequence}
					{options}
					title={text.name}
					{demo}
					bind:phase
					bind:desync
					{coach}
					placementDone={placement ? placementDone : undefined}
					onStart={start}
					onNext={next}
				/>
			</div>

			<!-- Controles: todos centrados; tempo y tolerancia a la izquierda, piano y metrónomo a la derecha -->
			<div class="panel flex items-center justify-center gap-2 p-3 text-sm sm:gap-3">
				<PopoverButton icon="gauge" tip="tempo" label="{t('controls.tempo')} · {bpm} bpm">
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
					data-tip="play"
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
					data-tip="guide"
					aria-label={t('controls.guide')}
					title={t('controls.guide')}
					onclick={() => (guide = !guide)}
				>
					<Icon name="piano" class="h-5 w-5" />
				</button>
				<!-- Batería (el ritmo se elige en la lista «Ritmos»); el corredor = a la mitad de velocidad -->
				<DrumControl
					enabled={drums}
					half={drumsHalf}
					onToggle={() => {
						drums = !drums;
						if (drums) void loadDrums();
					}}
					onHalf={() => (drumsHalf = !drumsHalf)}
				/>
			</div>
		</main>
	</div>
</div>

{#if creating}
	<CreateExerciseDialog
		range={{ low, high }}
		{meter}
		initialPrompt={suggestedPrompt}
		onPractice={practiceCreated}
		onDrum={practiceDrum}
		onClose={() => {
			creating = false;
			suggestedPrompt = '';
		}}
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

{#if onboarding}
	<Onboarding
		bind:low
		bind:high
		startStep={onboardingStep}
		{recommended}
		getDetector={micForCalibration}
		onTest={startPlacement}
		onFinish={finishOnboarding}
		onClose={closeOnboarding}
	/>
{/if}

{#if tip}
	{#key tip.id}
		<TipBubble
			target={tip.id}
			text={t(`tip.${tip.id}`)}
			onDismiss={() => markSeen(tip.id)}
			onSkipAll={markAllSeen}
		/>
	{/key}
{/if}

{#if customizing}
	<CustomizeDialog onClose={() => (customizing = false)} />
{/if}
