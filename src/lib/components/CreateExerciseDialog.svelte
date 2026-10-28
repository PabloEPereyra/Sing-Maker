<script lang="ts">
	// Crear un ejercicio desde texto o desde la foto de una partitura: el servidor le pide al modelo el
	// patrón (o la transcripción), lo valida (y le hace corregir si hace falta) y devuelve el ejercicio
	// en el formato de la app. Antes de practicar se puede escuchar y editar en el piano roll.
	import { startDictation, type Dictation } from '$lib/audio/dictation';
	import {
		imageToDataUrl,
		requestExercise,
		requestTranscription,
		GenerateRequestError,
		type GeneratedResponse
	} from '$lib/ai/client';
	import { settings } from '$lib/settings.svelte';
	import { t } from '$lib/i18n';
	import { parse } from '$lib/music/parser';
	import { playPattern, previewRoot, stopPreview } from '$lib/audio/preview';
	import { onDestroy } from 'svelte';
	import { toCode } from '$lib/ai/exercise';
	import type { DrumResult } from '$lib/ai/drums';
	import type { MeterId } from '$lib/music/meter';
	import CreateDrumPanel from './CreateDrumPanel.svelte';
	import PianoRoll from './PianoRoll.svelte';
	import Icon from './Icon.svelte';

	let {
		range,
		meter: currentMeter,
		initialPrompt = '',
		onPractice,
		onDrum,
		onClose
	}: {
		range: { low: number; high: number };
		/** Compás del ejercicio que se está practicando: el de los patrones de batería por defecto. */
		meter: MeterId;
		/** Descripción ya escrita (la recomendación del entrenador de IA). */
		initialPrompt?: string;
		onPractice: (code: string, prompt: string) => void;
		onDrum: (result: DrumResult, meter: MeterId) => void;
		onClose: () => void;
	} = $props();

	let tab = $state<'exercise' | 'drums'>('exercise');

	// svelte-ignore state_referenced_locally
	let prompt = $state(initialPrompt);
	let loading = $state(false);
	let error = $state('');
	let details = $state<string[]>([]);
	let result = $state<GeneratedResponse | null>(null);
	// ---------- dictado: se habla, Muse Voice Transcribe lo pasa a texto y se crea el ejercicio ----------
	const DICTATION_MAX_SEC = 30;
	let dictation: Dictation | null = null;
	let dictating = $state<'idle' | 'recording' | 'transcribing'>('idle');
	let dictationSec = $state(0);
	let dictationTimer: ReturnType<typeof setInterval> | null = null;

	async function toggleDictation() {
		if (dictating === 'recording') return finishDictation();
		if (dictating !== 'idle' || loading) return;
		error = '';
		try {
			dictation = await startDictation();
		} catch {
			error = t('dictation.noMic');
			return;
		}
		stopPreview();
		dictating = 'recording';
		dictationSec = 0;
		dictationTimer = setInterval(() => {
			dictationSec++;
			if (dictationSec >= DICTATION_MAX_SEC) void finishDictation();
		}, 1000);
	}

	async function finishDictation() {
		if (!dictation || dictating !== 'recording') return;
		if (dictationTimer) clearInterval(dictationTimer);
		dictating = 'transcribing';
		try {
			const text = await requestTranscription(await dictation.stop(), settings.lang);
			dictation = null;
			if (!text) {
				error = t('dictation.empty');
				return;
			}
			prompt = text;
			dictating = 'idle';
			// Lo dictado se usa directamente: «describile el ejercicio y que te lo haga».
			await create();
		} catch (e) {
			error = e instanceof Error ? e.message : t('create.error');
			details = e instanceof GenerateRequestError ? e.details : [];
		} finally {
			dictating = 'idle';
		}
	}

	onDestroy(() => {
		if (dictationTimer) clearInterval(dictationTimer);
		dictation?.cancel();
	});

	/** Compás del ejercicio a componer (la partitura trae el suyo). */
	let meter = $state<'4/4' | '6/8'>('4/4');

	/** Si el pedido nombra el compás («6/8», «seis por ocho», «cuatro por cuatro»), se elige solo. */
	function meterFromText(text: string): '4/4' | '6/8' | null {
		const s = text.toLowerCase();
		if (/6\s*\/\s*8|seis\s+por\s+ocho|six[\s-]+eight/.test(s)) return '6/8';
		if (/4\s*\/\s*4|cuatro\s+por\s+cuatro|four[\s-]+four|common time/.test(s)) return '4/4';
		return null;
	}
	/** Partitura adjunta (data URL, ya achicada). */
	let score = $state<string | null>(null);
	let dragging = $state(false);
	let fileInput = $state<HTMLInputElement>();

	async function attach(file: File | null | undefined) {
		if (!file || !file.type.startsWith('image/')) return;
		error = '';
		try {
			score = await imageToDataUrl(file);
		} catch {
			error = t('score.unreadable');
		}
	}

	/** Pegar una imagen con Ctrl+V (captura de pantalla de una partitura). */
	function onPaste(e: ClipboardEvent) {
		const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
		if (!item) return;
		e.preventDefault();
		void attach(item.getAsFile());
	}

	let listening = $state(false);
	let editing = $state(false);
	/** Raíz de referencia para los nombres del piano roll: fija mientras se edita. */
	let root = $state(60);

	/** Escuchar el resultado una vez, sobre una raíz en el medio del rango. */
	async function listen() {
		if (!result) return;
		if (listening) {
			stopPreview();
			return;
		}
		const { meta, notes } = parse(toCode(result.exercise));
		listening = true;
		await playPattern(notes, meta.bpm, previewRoot(notes, range.low, range.high));
		listening = false;
	}

	onDestroy(stopPreview);

	const EXAMPLES = ['create.ex1', 'create.ex2', 'create.ex3', 'create.ex4'] as const;

	async function create() {
		if ((!prompt.trim() && !score) || loading) return;
		meter = meterFromText(prompt) ?? meter;
		stopPreview();
		editing = false;
		loading = true;
		error = '';
		details = [];
		result = null;
		try {
			result = await requestExercise(
				prompt,
				settings.lang,
				range,
				score ?? undefined,
				score ? undefined : meter
			);
			root = previewRoot(parse(result.code).notes, range.low, range.high);
		} catch (e) {
			error = e instanceof Error ? e.message : t('create.error');
			details = e instanceof GenerateRequestError ? e.details : [];
		} finally {
			loading = false;
		}
	}

	/** Contorno del patrón para la vista previa (barras por nota). */
	const preview = $derived.by(() => {
		if (!result) return null;
		const notes = result.exercise.notes;
		const pitched = notes.filter((n) => !n.rest).map((n) => n.s);
		const lo = Math.min(...pitched);
		const hi = Math.max(...pitched);
		const total = notes.reduce((a, n) => a + n.d, 0);
		let x = 0;
		return notes.map((n) => {
			const bar = {
				x: (x / total) * 100,
				w: (n.d / total) * 100,
				y: n.rest ? null : hi === lo ? 50 : 85 - ((n.s - lo) / (hi - lo)) * 70,
				hint: !!n.hint
			};
			x += n.d;
			return bar;
		});
	});

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={onKey} onpaste={onPaste} />

<div
	class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
	role="presentation"
	onclick={(e) => e.target === e.currentTarget && onClose()}
>
	<div
		class="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-surface p-5 shadow-xl"
		role="dialog"
		aria-modal="true"
		aria-labelledby="create-title"
	>
		<div class="flex items-center justify-between">
			<h3 id="create-title" class="text-lg font-bold">✨ {t('create.title')}</h3>
			<button
				class="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2"
				aria-label={t('range.close')}
				onclick={onClose}>✕</button
			>
		</div>
		<div
			class="mt-3 flex rounded-lg border border-border bg-surface-2 p-0.5 text-sm"
			role="tablist"
		>
			{#each [['exercise', 'create.tabExercise'], ['drums', 'create.tabDrums']] as const as [id, label] (id)}
				<button
					class="flex-1 rounded-md px-3 py-1.5 font-semibold {tab === id
						? 'bg-accent text-white'
						: 'text-muted hover:text-fg'}"
					role="tab"
					aria-selected={tab === id}
					onclick={() => {
						stopPreview();
						tab = id;
					}}>{t(label)}</button
				>
			{/each}
		</div>
		{#if tab === 'drums'}
			<CreateDrumPanel meter={currentMeter} onUse={onDrum} />
		{:else}
			<p class="mt-1 text-sm text-muted">{t('create.intro')}</p>

			<!-- Partitura: subir, sacar una foto (celular), arrastrar o pegar -->
			<input
				bind:this={fileInput}
				type="file"
				accept="image/*"
				class="hidden"
				onchange={(e) => attach(e.currentTarget.files?.[0])}
			/>
			{#if score}
				<div
					class="mt-3 flex items-center gap-3 rounded-lg border border-accent/40 bg-accent/5 p-2"
				>
					<img
						src={score}
						alt={t('score.attached')}
						class="h-16 max-w-40 rounded border border-border bg-white object-contain"
					/>
					<div class="min-w-0 flex-1 text-sm">
						<div class="font-semibold">🎼 {t('score.attached')}</div>
						<div class="text-xs text-muted">{t('score.attachedHint')}</div>
					</div>
					<button
						class="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-surface-2"
						aria-label={t('score.remove')}
						onclick={() => (score = null)}>✕</button
					>
				</div>
			{:else}
				<button
					class="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed px-3 py-3 text-sm transition {dragging
						? 'border-accent bg-accent/10 text-accent'
						: 'border-border text-muted hover:border-accent/50 hover:text-fg'}"
					onclick={() => fileInput?.click()}
					ondragover={(e) => {
						e.preventDefault();
						dragging = true;
					}}
					ondragleave={() => (dragging = false)}
					ondrop={(e) => {
						e.preventDefault();
						dragging = false;
						void attach(e.dataTransfer?.files[0]);
					}}
				>
					<span class="text-lg">📷</span>
					<span>{t('score.upload')}</span>
				</button>
			{/if}

			<div class="relative mt-3">
				<textarea
					bind:value={prompt}
					rows="3"
					maxlength="1000"
					placeholder={dictating === 'recording'
						? t('dictation.listening')
						: score
							? t('score.placeholder')
							: t('create.placeholder')}
					class="w-full resize-none rounded-lg border border-border bg-base py-2 pr-14 pl-3 text-sm outline-none focus:border-accent"
					onkeydown={(e) => {
						if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void create();
					}}></textarea>
				<!-- Dictado: hablar en vez de escribir -->
				<button
					class="absolute right-2 bottom-3 grid h-10 w-10 place-items-center rounded-full transition disabled:opacity-50 {dictating ===
					'recording'
						? 'animate-pulse bg-red-500 text-white'
						: 'bg-accent/10 text-accent hover:bg-accent/20'}"
					aria-label={dictating === 'recording' ? t('dictation.stop') : t('dictation.start')}
					title={dictating === 'recording' ? t('dictation.stop') : t('dictation.start')}
					disabled={dictating === 'transcribing' || loading}
					onclick={toggleDictation}
				>
					{#if dictating === 'transcribing'}
						<span class="text-xs">…</span>
					{:else if dictating === 'recording'}
						<span class="text-[10px] font-bold tabular-nums">{dictationSec}s</span>
					{:else}
						<Icon name="mic" class="h-5 w-5" />
					{/if}
				</button>
			</div>
			{#if dictating === 'transcribing'}
				<p class="mt-1 text-xs text-muted">{t('dictation.transcribing')}</p>
			{/if}
			{#if !score}
				<div class="mt-2 flex flex-wrap gap-1.5">
					{#each EXAMPLES as key (key)}
						<button
							class="rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs hover:border-accent/50"
							onclick={() => (prompt = t(key))}>{t(key)}</button
						>
					{/each}
				</div>
			{/if}

			<div class="mt-3 flex items-center justify-end gap-3">
				{#if !score}
					<!-- Compás: la IA escribe el patrón para que llene compases enteros de este compás -->
					<div
						class="mr-auto flex rounded-lg border border-border bg-surface-2 p-0.5 text-sm"
						role="radiogroup"
						aria-label={t('create.meter')}
					>
						<span class="self-center px-2 text-xs text-muted">{t('create.meter')}</span>
						{#each ['4/4', '6/8'] as const as m (m)}
							<button
								class="rounded-md px-3 py-1 font-semibold {meter === m
									? 'bg-accent text-white'
									: 'text-muted hover:text-fg'}"
								role="radio"
								aria-checked={meter === m}
								onclick={() => (meter = m)}>{m}</button
							>
						{/each}
					</div>
				{/if}
				<button
					class="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
					disabled={(!prompt.trim() && !score) || loading}
					onclick={create}
					>{loading
						? score
							? t('score.reading')
							: t('create.working')
						: score
							? t('score.submit')
							: t('create.submit')}</button
				>
			</div>

			{#if error}
				<div
					role="alert"
					class="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
				>
					<p class="font-semibold">{t('create.error')} {error}</p>
					{#if details.length}
						<ul class="mt-1 list-disc pl-5 text-xs">
							{#each details as d, i (i)}<li>{d}</li>{/each}
						</ul>
					{/if}
				</div>
			{/if}

			{#if result && preview}
				<div class="mt-4 rounded-lg border border-border bg-base p-3">
					<div class="font-bold">{result.exercise.name}</div>
					<div class="text-sm text-muted">{result.exercise.description}</div>
					<svg viewBox="0 0 100 100" preserveAspectRatio="none" class="mt-2 h-20 w-full">
						{#each preview as b, i (i)}
							{#if b.y !== null}
								<rect
									x={b.x + 0.3}
									y={b.y - 4}
									width={Math.max(0.6, b.w - 0.6)}
									height="8"
									rx="2"
									class={b.hint ? 'fill-muted/40' : 'fill-accent'}
								/>
							{/if}
						{/each}
					</svg>
					{#if editing}
						<div class="mt-2">
							<PianoRoll
								bind:notes={result.exercise.notes}
								beatsPerMeasure={result.exercise.beatsPerMeasure}
								{root}
							/>
						</div>
					{/if}
					<div class="mt-2 text-xs text-muted">
						{result.exercise.bpm} bpm · {result.exercise.syllable || '—'} ·
						{t('create.attempts', { n: result.attempts, model: result.model })}
					</div>
					<div class="mt-3 flex justify-end gap-2">
						<button
							class="mr-auto inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-sm hover:bg-surface-2 {listening
								? 'border-accent text-accent'
								: ''}"
							onclick={listen}
							>{listening ? '■' : '▶'}
							{listening ? t('create.stopListen') : t('create.listen')}</button
						>
						<button
							class="rounded-lg border border-border bg-surface px-4 py-2 text-sm hover:bg-surface-2"
							onclick={create}>{t('create.again')}</button
						>
						<button
							class="rounded-lg border border-border bg-surface px-4 py-2 text-sm hover:bg-surface-2 {editing
								? 'border-accent text-accent'
								: ''}"
							aria-pressed={editing}
							onclick={() => (editing = !editing)}>✎ {t('create.edit')}</button
						>
						<button
							class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
							onclick={() => result && onPractice(toCode(result.exercise), prompt)}
							>{t('create.practice')}</button
						>
					</div>
				</div>
			{/if}
		{/if}
	</div>
</div>
