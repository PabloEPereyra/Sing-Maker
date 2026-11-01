<script lang="ts">
	import { onMount, tick } from 'svelte';
	import GameStage from '$lib/components/GameStage.svelte';
	import RangePicker from '$lib/components/RangePicker.svelte';
	import Onboarding from '$lib/components/Onboarding.svelte';
	import TipBubble from '$lib/components/TipBubble.svelte';
	import CustomizeDialog from '$lib/components/CustomizeDialog.svelte';
	import CreateExerciseDialog from '$lib/components/CreateExerciseDialog.svelte';
	import ExerciseBrowser from '$lib/components/ExerciseBrowser.svelte';
	import PracticePlan from '$lib/components/PracticePlan.svelte';
	import RhythmPicker from '$lib/components/RhythmPicker.svelte';

	import { addMine, loadMine, mine, removeMine } from '$lib/exercises/mine.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import PlaybackOptions from '$lib/components/PlaybackOptions.svelte';
	import ProfileMenu from '$lib/components/ProfileMenu.svelte';
	import { byLevel, exercises, exerciseText, shortName } from '$lib/exercises/catalog';
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
	import { DRUM_PATTERNS, patternsFor, type DrumPattern } from '$lib/audio/drums';
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
	import { toleranceOf, type Difficulty } from '$lib/game/difficulty';
	import { setUiSoundsMuted, uiClick } from '$lib/audio/uiSounds';
	import { loadAccess } from '$lib/access.svelte';
	import { loadHistory, recordAttempt } from '$lib/practice/history.svelte';
	import { loadTips, markAllSeen, markSeen, nextTip, recordDone } from '$lib/tips.svelte';
	import { t } from '$lib/i18n';

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

	let demo = $state(true); // sin micrófono hasta que se active
	let micError = $state('');
	let customizing = $state(false);
	let creating = $state(false);
	/** Selector de rango: se abre al tocar las notas a los lados de la barra de repeticiones. */
	let rangeOpen = $state(false);

	/** Descripción sugerida por el entrenador de IA para abrir el creador con el texto escrito. */
	let suggestedPrompt = $state('');
	/** Lista desplegable de ritmos del escenario; se cierra al elegir y al empezar a jugar. */
	let panel = $state<'rhythms' | null>(null);
	/** Visor de ejercicios (cuadrícula de niveles y tarjeta con el patrón). */
	let browsing = $state(false);
	/** «Tu rutina de hoy». */
	let planning = $state(false);
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
	/** Todos los ritmos por compás: los del compás del ejercicio se pueden elegir, los otros se ven en gris. */
	const rhythmGroups = $derived(
		(['4/4', '6/8'] as const).map((m) => ({
			meter: m,
			patterns: [
				...DRUM_PATTERNS.filter((p) => p.meter === m),
				...myDrums.list.filter((p) => p.meter === m)
			]
		}))
	);

	const drumPattern = $derived(patterns.find((p) => p.id === drumPick[meter]) ?? patterns[0]);
	/** El nivel de afinación elegido; la prueba de nivel usa siempre Normal para que sea comparable. */
	const tolerance = $derived(toleranceOf(placement ? 'normal' : settings.difficulty));
	const options: GameOptions = $derived({
		bpm,
		beatsPerMeasure: exercise.parsed.meta.beatsPerMeasure,
		subdivision: exercise.parsed.meta.subdivision,
		drums: drums ? drumPattern : null,
		drumsHalf,
		guide,
		tolerance
	});
	/** Niveles con los ejercicios que se ven: el catálogo y los desbloqueados de la biblioteca. */
	const levels = $derived(byLevel(visible));

	onMount(() => {
		loadSettings();
		loadMine();
		loadUnlocked();
		loadTips();
		loadAccess();
		loadHistory();

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
		const prefs = { low, high, guide, drums, drumsHalf, drumPick, demo };
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

	// Sonidos de la interfaz: un blip al tocar un botón, salvo mientras corre un ejercicio.
	$effect(() => setUiSoundsMuted(running));
	function onPointerDown(e: PointerEvent) {
		const button = (e.target as Element).closest('button');
		if (button && !button.disabled) uiClick(settings.sfx);
	}

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
			!customizing &&
			!rangeOpen &&
			!browsing &&
			!planning &&
			!panel
			? nextTip()
			: undefined
	);
	/** Pista dentro del creador de ejercicios (la pestaña «Con la voz»), solo la primera vez. */
	const createTip = $derived(loaded && creating && !onboarding ? nextTip('create') : undefined);

	/** Repite el ejercicio terminado en un nivel de afinación más estricto. */
	async function tryHarder(level: Difficulty) {
		settings.difficulty = level;
		await tick();
		void start();
	}

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
		panel = null;
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

		suggestedPrompt = '';
	}

	/** Devolución del entrenador de IA: qué se practicó y entre qué ejercicios puede recomendar. */
	const coachActions = {
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
	};
	const coach = $derived.by(() => {
		// Solo la lista que ve la persona, con sus nombres y números actuales, de más fácil a más difícil.
		const ordered = byLevel(visible).flatMap((lv) =>
			lv.exercises.map((e, i) => ({
				e,
				label: `${t('catalog.level')} ${lv.level} · ${i + 1} - ${shortName(e, settings.lang)}`
			}))
		);
		const here = ordered.findIndex((o) => o.e.id === exercise.id);
		return {
			exercise: {
				id: exercise.id,
				name: shortName(exercise, settings.lang),
				level: exercise.level === 'mine' ? 'custom' : exercise.level,
				category: exercise.category === 'mine' ? 'custom' : exercise.category,
				order: here >= 0 ? here : undefined
			},
			candidates: ordered
				.map(({ e, label }, order) => ({
					id: e.id,
					name: shortName(e, settings.lang),
					level: e.level,
					category: e.category,
					description: exerciseText(e, settings.lang).description.slice(0, 140),
					order,
					label
				}))
				.filter((c) => c.id !== exercise.id && (here < 0 || Math.abs(c.order - here) <= 6)),
			...coachActions
		};
	});

	/** Nombre del ritmo sin el compás: ya está en el título del grupo. */

	/** Elige el ritmo de la lista y enciende la batería. */
	function pickRhythm(id: string) {
		drumPick = { ...drumPick, [meter]: id };
		drums = true;
		panel = null;
		void loadDrums();
	}

	/** Guarda el patrón de batería creado con IA y lo deja sonando en el ejercicio. */
	function practiceDrum(result: DrumResult, patternMeter: MeterId) {
		stop();
		const pattern = addMyDrum(result, patternMeter);
		drumPick = { ...drumPick, [patternMeter]: pattern.id };
		drums = true;
		void loadDrums();
		panel = null;
	}

	function next() {
		// Mismo orden que la lista: nivel → categoría.
		const order = byLevel(visible).flatMap((lv) => lv.exercises);
		const i = order.findIndex((e) => e.id === selectedId);
		selectedId = order[(i + 1) % order.length].id;
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

<!-- Esquina de arriba a la derecha (solo fuera del juego): perfil. El micrófono vive en el panel de controles. -->
{#snippet side()}
	<ProfileMenu
		getDetector={micForCalibration}
		bind:highlight={desync}
		onGuide={() => openOnboarding()}
	/>
{/snippet}

<!-- Menú del escenario (arriba a la izquierda, solo fuera del juego): botones grandes; el de ritmos abre un panel -->
{#snippet menu()}
	<div class="relative">
		<div class="flex flex-col gap-3 pl-2 short:gap-2">
			<button
				class="skew-btn grid h-16 w-16 place-items-center rounded-[8px] bg-accent text-white shadow hover:brightness-110 short:h-11 short:w-11 {browsing
					? 'outline-4 outline-white/90'
					: ''}"
				aria-haspopup="dialog"
				aria-label={t('menu.exercises')}
				title={t('menu.exercises')}
				data-tip="exercises"
				onclick={() => {
					markSeen('exercises');
					panel = null;
					browsing = true;
				}}
			>
				<span class="skew-icon"><Icon name="note" class="h-9 w-9 short:h-6 short:w-6" /></span>
			</button>
			<button
				class="skew-btn grid h-16 w-16 place-items-center rounded-[8px] bg-accent text-white shadow hover:brightness-110 short:h-11 short:w-11 {planning
					? 'outline-4 outline-white/90'
					: ''}"
				aria-haspopup="dialog"
				aria-label={t('routine.title')}
				title={t('routine.title')}
				data-tip="routine"
				onclick={() => {
					markSeen('routine');
					panel = null;
					planning = true;
				}}
			>
				<span class="skew-icon"
					><Icon name="notebook-pen" class="h-9 w-9 short:h-6 short:w-6" /></span
				>
			</button>
			<button
				class="skew-btn grid h-16 w-16 place-items-center rounded-[8px] bg-accent text-white shadow hover:brightness-110 short:h-11 short:w-11 {panel ===
				'rhythms'
					? 'outline-4 outline-white/90'
					: ''}"
				aria-haspopup="dialog"
				aria-label={t('rhythms.title')}
				title={t('rhythms.title')}
				data-tip="rhythms"
				onclick={() => {
					markSeen('rhythms');
					panel = 'rhythms';
				}}
			>
				<span class="skew-icon"><Icon name="drum" class="h-9 w-9 short:h-6 short:w-6" /></span>
			</button>
			<button
				class="skew-btn grid h-16 w-16 place-items-center rounded-[8px] bg-accent text-white shadow hover:brightness-110 short:h-11 short:w-11"
				aria-label={t('create.button')}
				title={t('create.button')}
				data-tip="create"
				onclick={() => {
					markSeen('create');
					panel = null;
					stop();
					creating = true;
				}}
			>
				<span class="skew-icon"><Icon name="wand" class="h-9 w-9 short:h-6 short:w-6" /></span>
			</button>
			<button
				class="skew-btn grid h-16 w-16 place-items-center rounded-[8px] bg-accent text-white shadow hover:brightness-110 short:h-11 short:w-11"
				aria-label={t('header.customize')}
				title={t('header.customize')}
				data-tip="customize"
				onclick={() => {
					markSeen('customize');
					panel = null;
					customizing = true;
				}}
			>
				<span class="skew-icon"><Icon name="palette" class="h-9 w-9 short:h-6 short:w-6" /></span>
			</button>
		</div>
	</div>
{/snippet}

<svelte:document onpointerdown={onPointerDown} />

<div class="flex h-dvh flex-col">

	{#if micError}
		<div class="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
			<div
				role="alert"
				class="pointer-events-auto rounded-lg border-2 border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 shadow-lg"
			>
				{micError}
			</div>
		</div>
	{/if}

	<div class="flex min-h-0 flex-1 flex-col">
		<!-- Escena -->
		<main class="flex min-h-0 min-w-0 flex-1 flex-col">
			{#if placement}
				<div class="panel m-2 flex items-center gap-3 px-4 py-2 text-sm">
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
			<div class="min-h-[320px] flex-1 short:min-h-0">
				<GameStage
					bind:this={stage}
					{theme}
					{sequence}
					{options}
					{low}
					{high}
					title={text.name}
					{demo}
					bind:phase
					bind:desync
					{coach}
					placementDone={placement ? placementDone : undefined}
					{controls}
					menu={placement ? undefined : menu}
					{side}
					onTryHarder={tryHarder}
					onFinish={(pct) => {
						// Solo cuenta lo cantado de verdad: ni la demostración ni la prueba de nivel
						if (!demo && !placement) recordAttempt(exercise.id, pct);
					}}
					onRange={() => {
						markSeen('range');
						rangeOpen = true;
					}}
					onStart={start}
					onNext={next}
				/>
			</div>

			<!-- Controles: dentro del escenario, abajo (ver GameStage) -->
			{#snippet controls()}
				<div class="flex items-center justify-center gap-2 text-sm sm:gap-3">
					<button
						class="grid h-12 w-12 place-items-center rounded-full bg-accent text-white shadow hover:brightness-110 short:h-10 short:w-10"
						aria-label={t('controls.stop')}
						title={t('controls.stop')}
						onclick={stop}
					>
						<Icon name="back" class="h-5 w-5" />
					</button>
					<button
						data-tip="play"
						class="grid h-14 w-14 place-items-center rounded-full bg-accent text-white shadow hover:brightness-110 short:h-12 short:w-12"
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
					<!-- Piano guía, batería (el ritmo se elige en «Ritmos»), tempo y zoom, en un solo panel -->
					<PlaybackOptions
							bind:bpm
							bpmMin={BPM_MIN}
							bpmMax={BPM_MAX}
							bind:guide
							bind:drums
							micOn={!demo}
							onMic={toggleMic}
						/>
				</div>
			{/snippet}
		</main>
	</div>
</div>

{#if browsing}
	<ExerciseBrowser
		{levels}
		mine={mine.list}
		{selectedId}
		{low}
		{high}
		onPick={(id) => {
			stop();
			selectedId = id;
			browsing = false;
		}}
		onDelete={removeMine}
		onClose={() => (browsing = false)}
	/>
{/if}

{#if planning}
	<PracticePlan
		pool={visible}
		onPick={(id) => {
			stop();
			selectedId = id;
			planning = false;
		}}
		onCreate={(prompt) => {
			stop();
			suggestedPrompt = prompt;
			planning = false;
			creating = true;
		}}
		onClose={() => (planning = false)}
	/>
{/if}

{#if panel === 'rhythms'}
	<RhythmPicker
		groups={rhythmGroups}
		{meter}
		activeId={drumPattern.id}
		bind:half={drumsHalf}
		onPick={pickRhythm}
		onDelete={removeMyDrum}
		onCreate={practiceDrum}
		onClose={() => (panel = null)}
	/>
{/if}

{#if rangeOpen}
	<RangePicker
		bind:low
		bind:high
		getDetector={() => ensureMic()}
		onClose={() => (rangeOpen = false)}
	/>
{/if}

{#if creating}
	<CreateExerciseDialog
		range={{ low, high }}
		getDetector={() => ensureMic()}
		initialPrompt={suggestedPrompt}
		onPractice={practiceCreated}
		onClose={() => {
			creating = false;
			suggestedPrompt = '';
		}}
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

{#if createTip}
	{#key createTip.id}
		<TipBubble
			target={createTip.id}
			text={t(`tip.${createTip.id}`)}
			onDismiss={() => markSeen(createTip.id)}
			onSkipAll={markAllSeen}
		/>
	{/key}
{/if}

{#if customizing}
	<CustomizeDialog onClose={() => (customizing = false)} />
{/if}
