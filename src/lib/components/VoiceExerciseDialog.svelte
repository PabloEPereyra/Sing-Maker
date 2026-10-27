<script lang="ts">
	// Crear un ejercicio cantando: se graba el tono unos segundos, la app separa las notas, estima el
	// tempo, cuantiza y agrega la guía; después se revisa en el piano roll (y la IA lo puede acomodar).
	import { onDestroy } from 'svelte';
	import type { PitchDetector } from '$lib/audio/pitch';
	import { playPattern, stopPreview } from '$lib/audio/preview';
	import { toCode, validateGenerated, type GeneratedExercise } from '$lib/ai/exercise';
	import { requestExercise } from '$lib/ai/client';
	import { parse } from '$lib/music/parser';
	import { transcribe, type PitchFrame } from '$lib/music/transcribe';
	import { settings } from '$lib/settings.svelte';
	import { t } from '$lib/i18n';
	import PianoRoll from './PianoRoll.svelte';

	let {
		range,
		getDetector,
		onPractice,
		onClose
	}: {
		range: { low: number; high: number };
		getDetector: () => Promise<PitchDetector | null>;
		onPractice: (code: string, prompt: string) => void;
		onClose: () => void;
	} = $props();

	const MAX_SEC = 15;

	let step = $state<'idle' | 'recording' | 'review'>('idle');
	let frames = $state.raw<PitchFrame[]>([]);
	let elapsed = $state(0);
	let ex = $state<GeneratedExercise | null>(null);
	let error = $state('');
	let listening = $state(false);
	let arranging = $state(false);
	/**
	 * Nota en que se empezó a cantar: el piano roll y la escucha usan esa tonalidad, para ver y oír
	 * lo mismo que se cantó (al practicar, el ejercicio se transporta al rango como siempre).
	 */
	let root = $state(60);

	function setExercise(next: GeneratedExercise, sungRoot?: number) {
		ex = next;
		if (sungRoot !== undefined) root = sungRoot;
	}
	let raf = 0;

	async function record() {
		error = '';
		stopPreview();
		const d = await getDetector();
		if (!d) {
			error = t('voice.noMic');
			return;
		}
		frames = [];
		elapsed = 0;
		step = 'recording';
		const t0 = performance.now();
		const loop = (now: number) => {
			const time = (now - t0) / 1000;
			const r = d.read(now);
			frames = [...frames, { time, midi: r.midi, rms: r.rms }];
			elapsed = time;
			if (time >= MAX_SEC) finish();
			else raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
	}

	function finish() {
		cancelAnimationFrame(raf);
		const result = transcribe(frames, t('voice.defaultName'), t('voice.defaultDesc'));
		if (!result) {
			error = t('voice.tooShort');
			step = 'idle';
			return;
		}
		setExercise(result.exercise, result.root);
		step = 'review';
	}

	/** Rastro del tono en vivo (últimos 6 s). */
	const trace = $derived.by(() => {
		const pts = frames.filter((f) => f.time >= elapsed - 6);
		const voiced = pts.filter((f) => f.midi !== null).map((f) => f.midi!);
		if (!voiced.length) return '';
		const lo = Math.min(...voiced) - 2;
		const hi = Math.max(...voiced) + 2;
		const span = Math.max(12, hi - lo);
		const mid = (lo + hi) / 2;
		let d = '';
		let pen = false;
		for (const f of pts) {
			if (f.midi === null) {
				pen = false;
				continue;
			}
			const x = ((f.time - (elapsed - 6)) / 6) * 100;
			const y = 50 - ((f.midi - mid) / span) * 90;
			d += `${pen ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
			pen = true;
		}
		return d;
	});

	const errors = $derived(ex ? validateGenerated(ex, range) : []);

	async function listen() {
		if (!ex) return;
		if (listening) {
			stopPreview();
			return;
		}
		const { meta, notes } = parse(toCode(ex));
		listening = true;
		await playPattern(notes, meta.bpm, root);
		listening = false;
	}

	/** La IA acomoda la melodía en un patrón prolijo que entre en compás (y le pone nombre). */
	async function arrange() {
		if (!ex) return;
		stopPreview();
		arranging = true;
		error = '';
		const notes = ex.notes
			.filter((n) => !n.hint)
			.map((n) => (n.rest ? `rest:${n.d}` : `${n.s}:${n.d}`))
			.join(' ');
		const prompt =
			`Arrange this melody that a singer hummed into a clean vocal exercise. ` +
			`Notes as semitones-from-first-note:beats, in order: ${notes}. Tempo about ${ex.bpm} bpm. ` +
			`Keep the same pitches in the same order (fix only obvious slips), make the rhythm even ` +
			`and fill whole measures, start with the guide note and give it a short descriptive name.`;
		try {
			const res = await requestExercise(prompt, settings.lang, range, undefined, '4/4');
			setExercise(res.exercise);
		} catch (e) {
			error = e instanceof Error ? e.message : t('create.error');
		} finally {
			arranging = false;
		}
	}

	function practice() {
		if (!ex || errors.length) return;
		stopPreview();
		onPractice(toCode(ex), t('voice.source'));
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	onDestroy(() => {
		cancelAnimationFrame(raf);
		stopPreview();
	});
</script>

<svelte:window onkeydown={onKey} />

<div
	class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
	role="presentation"
	onclick={(e) => e.target === e.currentTarget && onClose()}
>
	<div
		class="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-surface p-5 shadow-xl"
		role="dialog"
		aria-modal="true"
		aria-labelledby="voice-title"
	>
		<div class="flex items-center justify-between">
			<h3 id="voice-title" class="text-lg font-bold">🎤 {t('voice.title')}</h3>
			<button
				class="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2"
				aria-label={t('range.close')}
				onclick={onClose}>✕</button
			>
		</div>

		{#if step !== 'review'}
			<p class="mt-1 text-sm text-muted">{t('voice.intro')}</p>
			<div class="mt-4 rounded-lg border border-border bg-base p-3">
				<svg viewBox="0 0 100 100" preserveAspectRatio="none" class="h-28 w-full">
					<path
						d={trace}
						fill="none"
						class="stroke-accent"
						stroke-width="2.5"
						vector-effect="non-scaling-stroke"
					/>
				</svg>
				<div class="mt-2 flex items-center justify-between text-sm">
					<span class="text-muted tabular-nums">
						{step === 'recording' ? `${elapsed.toFixed(1)} s / ${MAX_SEC} s` : t('voice.ready')}
					</span>
					{#if step === 'recording'}
						<button
							class="inline-flex items-center gap-2 rounded-lg bg-red-500 px-5 py-2 font-semibold text-white"
							onclick={finish}
						>
							<span class="h-2.5 w-2.5 animate-pulse rounded-full bg-white"></span>
							{t('voice.stop')}
						</button>
					{:else}
						<button class="rounded-lg bg-accent px-5 py-2 font-semibold text-white" onclick={record}
							>● {t('voice.record')}</button
						>
					{/if}
				</div>
			</div>
		{:else if ex}
			<div class="mt-3 flex flex-wrap items-end gap-3">
				<label class="flex min-w-48 flex-1 flex-col gap-1 text-xs text-muted">
					{t('voice.name')}
					<input
						bind:value={ex.name}
						maxlength="60"
						class="rounded-lg border border-border bg-base px-3 py-1.5 text-sm text-fg outline-none focus:border-accent"
					/>
				</label>
				<label class="flex w-44 flex-col gap-1 text-xs text-muted">
					{t('voice.tempo')} · {ex.bpm} bpm
					<input type="range" min="60" max="150" step="5" bind:value={ex.bpm} />
				</label>
			</div>
			<p class="mt-3 mb-1.5 text-xs text-muted">{t('voice.review')}</p>
			<PianoRoll bind:notes={ex.notes} beatsPerMeasure={ex.beatsPerMeasure} {root} />
			{#if errors.length}
				<ul class="mt-2 list-disc pl-5 text-xs text-red-600">
					{#each errors as e, i (i)}<li>{e}</li>{/each}
				</ul>
			{/if}
			{#if import.meta.env.DEV}
				<!-- Solo en desarrollo: los cuadros de tono y volumen, para analizar una grabación que salió mal -->
				<button
					class="mt-1 block text-xs text-muted underline"
					onclick={() => {
						const a = document.createElement('a');
						a.download = 'singmaker-grabacion.json';
						a.href = URL.createObjectURL(
							new Blob([JSON.stringify({ frames, root, result: ex })], {
								type: 'application/json'
							})
						);
						a.click();
						URL.revokeObjectURL(a.href);
					}}>↓ datos de la grabación (diagnóstico)</button
				>
			{/if}
			<div class="mt-3 flex flex-wrap justify-end gap-2">
				<button
					class="mr-auto rounded-lg border border-border bg-surface px-4 py-2 text-sm hover:bg-surface-2 {listening
						? 'border-accent text-accent'
						: ''}"
					onclick={listen}
					>{listening ? '■' : '▶'} {listening ? t('create.stopListen') : t('create.listen')}</button
				>
				<button
					class="rounded-lg border border-border bg-surface px-4 py-2 text-sm hover:bg-surface-2"
					onclick={() => {
						stopPreview();
						step = 'idle';
						frames = [];
					}}>● {t('voice.again')}</button
				>
				<button
					class="rounded-lg border border-border bg-surface px-4 py-2 text-sm hover:bg-surface-2 disabled:opacity-50"
					disabled={arranging}
					onclick={arrange}>✨ {arranging ? t('create.working') : t('voice.arrange')}</button
				>
				<button
					class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
					disabled={errors.length > 0}
					onclick={practice}>{t('create.practice')}</button
				>
			</div>
		{/if}

		{#if error}
			<div
				role="alert"
				class="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
			>
				{error}
			</div>
		{/if}
	</div>
</div>
