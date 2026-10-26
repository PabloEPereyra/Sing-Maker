<script lang="ts">
	import { onMount } from 'svelte';
	import GameStage from '$lib/components/GameStage.svelte';
	import { byLevel, categoryLabel, exercises } from '$lib/exercises/catalog';
	import RangePicker from '$lib/components/RangePicker.svelte';
	import { generateSequence } from '$lib/music/generate';
	import { midiToSolfege } from '$lib/music/notes';
	import { getContext, loadPiano } from '$lib/audio/engine';
	import { PitchDetector } from '$lib/audio/pitch';
	import { autopilot, type GameOptions } from '$lib/game/game';
	import { createSkyTheme } from '$lib/game/themes/sky';

	const PREFS_KEY = 'singmaker-prefs';
	const theme = createSkyTheme();

	let selectedId = $state(byLevel()[0].exercises[0].id);
	let low = $state(45); // A2 (tenor)
	let high = $state(72); // C5
	let tempo = $state(1); // multiplicador sobre el bpm del ejercicio
	let guide = $state(true);
	let metronome = $state(false);
	let tolerance = $state(0.6);
	let demo = $state(false);
	let micError = $state('');
	let micStatus = $state('');
	let search = $state('');

	let stage: GameStage;
	let detector: PitchDetector | null = null;

	const exercise = $derived(exercises.find((e) => e.id === selectedId) ?? exercises[0]);
	const bpm = $derived(Math.round(exercise.parsed.meta.bpm * tempo));
	const sequence = $derived(
		generateSequence(exercise.parsed.notes, {
			low,
			high,
			direction: exercise.parsed.meta.direction,
			bpm
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
						`${e.name} ${e.category} ${e.parsed.meta.description}`.toLowerCase().includes(query)
					)
				: exercises
		)
	);

	onMount(() => {
		try {
			const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}');
			if (typeof p.low === 'number') low = p.low;
			if (typeof p.high === 'number') high = p.high;
			if (typeof p.guide === 'boolean') guide = p.guide;
			if (typeof p.tolerance === 'number') tolerance = p.tolerance;
			if (typeof p.demo === 'boolean') demo = p.demo;
		} catch {}
		void loadPiano();
		return () => detector?.stop();
	});

	$effect(() => {
		const prefs = { low, high, guide, tolerance, demo };
		try {
			localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
		} catch {}
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
			micError = 'No se pudo usar el micrófono. Revisá el permiso o probá el modo demo.';
			return null;
		}
		if (forceCalibration) {
			micStatus = 'Calibrando: hacé silencio un momento…';
			await detector.calibrate();
			micStatus = `Micrófono calibrado (umbral ${(20 * Math.log10(detector.gate)).toFixed(0)} dB)`;
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

	function stop() {
		stage.stop();
	}

	function next() {
		// Mismo orden que la lista: nivel → categoría.
		const order = byLevel().flatMap((lv) => lv.categories.flatMap(([, list]) => list));
		const i = order.findIndex((e) => e.id === selectedId);
		selectedId = order[(i + 1) % order.length].id;
	}
</script>

<div class="flex h-dvh flex-col">
	<header class="flex items-center justify-between gap-4 border-b border-border px-4 py-2.5">
		<div class="flex items-center gap-3">
			<img src="/favicon.svg" alt="" class="h-8 w-8" />
			<div>
				<h1 class="text-lg leading-tight font-black">Sing Maker</h1>
				<p class="text-xs text-muted">Ejercicios vocales a tu medida</p>
			</div>
		</div>
		<div class="flex items-center gap-4 text-sm text-muted">
			{#if !demo}
				<button
					class="rounded-lg border border-border px-3 py-1 hover:bg-surface-2"
					title="Mide el ruido ambiente para ignorarlo. Usá auriculares para que el piano no entre al micrófono."
					onclick={() => ensureMic(true)}
				>
					🎤 Calibrar micrófono
				</button>
			{/if}
			<label class="flex cursor-pointer items-center gap-2">
				<input type="checkbox" bind:checked={demo} class="accent-accent" />
				Modo demo (sin micrófono)
			</label>
		</div>
	</header>

	<div class="flex min-h-0 flex-1 flex-col gap-3 p-3 lg:flex-row">
		<!-- Catálogo -->
		<aside
			class="flex max-h-64 min-h-0 flex-col rounded-lg border border-border bg-surface lg:max-h-none lg:w-72"
		>
			<div class="border-b border-border p-3">
				<input
					type="search"
					placeholder="Buscar ejercicio…"
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
								class="h-3 w-3 shrink-0 rounded-lg border border-black/20"
								style:background={lv.color}
							></span>
							<span class="font-bold">Nivel {lv.level}</span>
							<span class="text-sm text-muted">· {lv.name}</span>
							<span class="ml-auto text-xs text-muted">{lv.exercises.length}</span>
							<span class="text-muted transition group-open:rotate-90">›</span>
						</summary>
						<div class="px-1 pb-2">
							{#each lv.categories as [category, list] (category)}
								<div
									class="px-2 pt-2 pb-0.5 text-[11px] font-bold tracking-wide text-muted uppercase"
								>
									{categoryLabel(category)}
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
										{e.name}
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
					title={exercise.name}
					onStart={start}
					onNext={next}
				/>
			</div>

			<!-- Controles -->
			<div
				class="flex flex-wrap items-end gap-x-5 gap-y-3 rounded-lg border border-border bg-surface p-3 text-sm"
			>
				<RangePicker bind:low bind:high getDetector={() => ensureMic()} />
				<div>
					<div class="mb-1 text-xs text-muted">Tempo · {bpm} bpm</div>
					<input
						type="range"
						min="0.5"
						max="1.5"
						step="0.05"
						bind:value={tempo}
						class="accent-accent"
					/>
				</div>
				<div>
					<div class="mb-1 text-xs text-muted">Tolerancia · ±{tolerance.toFixed(1)} st</div>
					<input
						type="range"
						min="0.3"
						max="1.5"
						step="0.1"
						bind:value={tolerance}
						class="accent-accent"
					/>
				</div>
				<label class="flex items-center gap-2 py-1.5">
					<input type="checkbox" bind:checked={guide} class="accent-accent" /> Piano guía
				</label>
				<label class="flex items-center gap-2 py-1.5">
					<input type="checkbox" bind:checked={metronome} class="accent-accent" /> Metrónomo
				</label>
				<div class="ml-auto flex gap-2">
					<button
						class="rounded-lg bg-surface-2 px-4 py-1.5 font-semibold hover:bg-border"
						onclick={stop}
					>
						■ Parar
					</button>
					<button class="rounded-lg bg-accent px-4 py-1.5 font-bold text-white" onclick={start}>
						▶ Volar
					</button>
				</div>
				<div class="basis-full text-xs text-muted">
					{exercise.parsed.meta.description} · {sequence.reps.length} repeticiones ({sequence
						.reps[0]
						? midiToSolfege(sequence.reps[0].rootMidi)
						: '—'} → {sequence.reps.at(-1) ? midiToSolfege(sequence.reps.at(-1)!.rootMidi) : '—'})
					{#if micError}<span class="ml-2 text-red-600">{micError}</span>
					{:else if micStatus && !demo}<span class="ml-2">· {micStatus}</span>{/if}
				</div>
			</div>
		</main>
	</div>
</div>
