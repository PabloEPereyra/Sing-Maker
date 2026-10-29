<script lang="ts">
	import { onMount, tick } from 'svelte';
	import GameStage from '$lib/components/GameStage.svelte';
	import RangePicker from '$lib/components/RangePicker.svelte';
	import Onboarding from '$lib/components/Onboarding.svelte';
	import TipBubble from '$lib/components/TipBubble.svelte';
	import CustomizeDialog from '$lib/components/CustomizeDialog.svelte';
	import CreateExerciseDialog from '$lib/components/CreateExerciseDialog.svelte';

	import { addMine, loadMine, mine, removeMine } from '$lib/exercises/mine.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import PopoverButton from '$lib/components/PopoverButton.svelte';
	import ProfileMenu from '$lib/components/ProfileMenu.svelte';
	import DrumControl from '$lib/components/DrumControl.svelte';
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

	let demo = $state(true); // sin micrófono hasta que se active
	let micError = $state('');
	let search = $state('');
	let customizing = $state(false);
	let creating = $state(false);

	/** Descripción sugerida por el entrenador de IA para abrir el creador con el texto escrito. */
	let suggestedPrompt = $state('');
	/** Panel desplegable del escenario (ejercicios o ritmos); se cierra al elegir y al empezar a jugar. */
	let panel = $state<'exercises' | 'rhythms' | null>(null);
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
		loaded && phase === 'idle' && !onboarding && !placement && !creating && !customizing && !panel
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
	const rhythmName = (p: DrumPattern) => p.name.replace(/\s*(4\/4|6\/8)\s*/, ' ').trim();

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

<!-- Fila de la lista de ritmos: elegir el patrón (y encender la batería); los de otro compás se ven en gris -->
{#snippet rhythmRow(p: DrumPattern, active: boolean)}
	{@const mineOwn = p.id.startsWith('my-drum-')}
	<div class="mt-1 flex items-stretch gap-1">
		<button
			class="ex-card !mt-0 min-w-0 flex-1 {active && p.id === drumPattern.id ? 'ex-card-on' : ''}"
			aria-pressed={active && p.id === drumPattern.id}
			disabled={!active}
			onclick={() => pickRhythm(p.id)}
		>
			<span class="min-w-0 flex-1 truncate"
				>{#if mineOwn}✨
				{/if}{rhythmName(p)}</span
			>
		</button>
		{#if mineOwn}
			<button
				class="trash-btn"
				aria-label={t('create.delete')}
				title={t('create.delete')}
				onclick={() => removeMyDrum(p.id)}
			>
				<Icon name="trash" class="h-4 w-4" />
			</button>
		{/if}
	</div>
{/snippet}

<!-- Menú del escenario (arriba a la izquierda, solo fuera del juego): dos botones grandes que abren paneles -->
{#snippet menu()}
	<div class="relative">
		<div class="flex items-center gap-2">
			<button
				class="grid h-[4.5rem] w-[4.5rem] place-items-center rounded-full bg-accent text-white shadow hover:brightness-110 {panel ===
				'exercises'
					? 'ring-4 ring-white/90'
					: ''}"
				aria-expanded={panel === 'exercises'}
				aria-label={t('menu.exercises')}
				title={t('menu.exercises')}
				data-tip="exercises"
				onclick={() => {
					markSeen('exercises');
					panel = panel === 'exercises' ? null : 'exercises';
				}}
			>
				<Icon name="note" class="h-9 w-9" />
			</button>
			<button
				class="grid h-[4.5rem] w-[4.5rem] place-items-center rounded-full bg-accent text-white shadow hover:brightness-110 {panel ===
				'rhythms'
					? 'ring-4 ring-white/90'
					: ''}"
				aria-expanded={panel === 'rhythms'}
				aria-label={t('rhythms.title')}
				title={t('rhythms.title')}
				data-tip="rhythms"
				onclick={() => {
					markSeen('rhythms');
					panel = panel === 'rhythms' ? null : 'rhythms';
				}}
			>
				<Icon name="drum" class="h-9 w-9" />
			</button>
		</div>
		{#if panel === 'exercises'}
			<div
				class="panel absolute top-[5.25rem] left-0 flex max-h-[min(36rem,calc(100dvh-17rem))] w-72 max-w-[calc(100vw-2rem)] flex-col"
			>
				<div class="border-b border-border p-2">
					<input
						type="search"
						placeholder={t('catalog.search')}
						bind:value={search}
						class="w-full rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-accent"
					/>
				</div>
				<div class="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
					{#if mine.list.length && !query}
						<details class="group level-card">
							<summary
								class="ribbon flex cursor-pointer list-none items-center gap-2 px-3 py-2 select-none"
								style:--ribbon="#8b5cf6"
							>
								<span class="ribbon-dot" aria-hidden="true">✨</span>
								<span class="truncate">{t('create.mine')}</span>
								<span class="ml-auto rounded-full bg-black/15 px-2 text-xs font-bold"
									>{mine.list.length}</span
								>
								<span class="transition group-open:rotate-90">›</span>
							</summary>
							<div class="px-1 pb-2">
								{#each mine.list as e (e.id)}
									<div class="mt-1 flex items-stretch gap-1">
										<button
											class="ex-card !mt-0 min-w-0 flex-1 {e.id === selectedId ? 'ex-card-on' : ''}"
											aria-current={e.id === selectedId}
											title={e.parsed.meta.description}
											onclick={() => {
												stop();
												selectedId = e.id;
												panel = null;
											}}
										>
											<span class="min-w-0 flex-1 truncate"
												>{exerciseText(e, settings.lang).name}</span
											>
										</button>
										<button
											class="trash-btn"
											aria-label={t('create.delete')}
											title={t('create.delete')}
											onclick={() => removeMine(e.id)}
										>
											<Icon name="trash" class="h-4 w-4" />
										</button>
									</div>
								{/each}
							</div>
						</details>
					{/if}

					{#each levels as lv (lv.level)}
						<details class="group level-card" open={!!query}>
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
										class="ex-card flex items-center gap-2 {e.id === selectedId
											? 'ex-card-on'
											: ''}"
										aria-current={e.id === selectedId}
										onclick={() => {
											stop();
											selectedId = e.id;
											panel = null;
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
			</div>
		{:else if panel === 'rhythms'}
			<div
				class="panel absolute top-[5.25rem] left-0 flex max-h-[min(36rem,calc(100dvh-17rem))] w-72 max-w-[calc(100vw-2rem)] flex-col"
			>
				<div class="min-h-0 flex-1 overflow-y-auto p-2 pb-3">
					<div class="px-2 pt-2 pb-1">
						<div class="mb-1 text-[11px] font-bold tracking-wide text-muted uppercase">
							{t('rhythms.speed')}
						</div>
						<div class="pill-group !h-8 w-full" role="group" aria-label={t('rhythms.speed')}>
							{#each [[false, 'rhythms.speedNormal'], [true, 'rhythms.speedHalf']] as const as [half, label] (label)}
								<button
									class="flex-1 px-1 text-xs font-semibold transition {drumsHalf === half
										? 'bg-accent text-white'
										: 'hover:bg-surface-2'}"
									aria-pressed={drumsHalf === half}
									onclick={() => (drumsHalf = half)}
								>
									{t(label)}
								</button>
							{/each}
						</div>
					</div>
					{#each rhythmGroups as g (g.meter)}
						<div
							class="px-2 pt-2 pb-0.5 text-sm font-extrabold {g.meter === meter
								? 'text-accent-dark'
								: 'text-muted'}"
						>
							{g.meter}
						</div>
						{#each g.patterns as p (p.id)}{@render rhythmRow(p, g.meter === meter)}{/each}
					{/each}
				</div>
			</div>
		{/if}
	</div>
{/snippet}

<svelte:document onpointerdown={onPointerDown} />

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
			<button
				class="round-btn round-btn-on gap-1.5 px-4"
				data-tip="create"
				onclick={() => {
					markSeen('create');
					stop();
					creating = true;
				}}
			>
				<span aria-hidden="true">✨</span>
				<span class="hidden font-display font-semibold sm:inline">{t('create.button')}</span>
			</button>
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

	<div class="flex min-h-0 flex-1 flex-col gap-3 p-2">
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
					{controls}
					menu={placement ? undefined : menu}
					onTryHarder={tryHarder}
					onStart={start}
					onNext={next}
				/>
			</div>

			<!-- Controles: dentro del escenario, abajo (ver GameStage) -->
			{#snippet controls()}
				<div class="flex items-center justify-center gap-2 text-sm sm:gap-3">
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

					<button
						class="grid h-12 w-12 place-items-center rounded-full bg-accent text-white shadow hover:brightness-110"
						aria-label={t('controls.stop')}
						title={t('controls.stop')}
						onclick={stop}
					>
						<Icon name="back" class="h-5 w-5" />
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
						onToggle={() => {
							drums = !drums;
							if (drums) void loadDrums();
						}}
					/>
				</div>
			{/snippet}
		</main>
	</div>
</div>

{#if creating}
	<CreateExerciseDialog
		range={{ low, high }}
		getDetector={() => ensureMic()}
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
