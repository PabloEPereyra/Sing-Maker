<script lang="ts">
	// Crear un ejercicio desde texto: el servidor le pide al modelo un patrón, lo valida (y le hace
	// corregir si hace falta) y devuelve el ejercicio en el formato de la app.
	// Pendiente: revisar/editar en un piano roll antes de practicar.
	import { requestExercise, GenerateRequestError, type GeneratedResponse } from '$lib/ai/client';
	import { settings } from '$lib/settings.svelte';
	import { t } from '$lib/i18n';
	import { parse } from '$lib/music/parser';
	import { playPattern, previewRoot, stopPreview } from '$lib/audio/preview';
	import { onDestroy } from 'svelte';
	import { toCode } from '$lib/ai/exercise';
	import PianoRoll from './PianoRoll.svelte';

	let {
		range,
		onPractice,
		onClose
	}: {
		range: { low: number; high: number };
		onPractice: (code: string, prompt: string) => void;
		onClose: () => void;
	} = $props();

	let prompt = $state('');
	let loading = $state(false);
	let error = $state('');
	let details = $state<string[]>([]);
	let result = $state<GeneratedResponse | null>(null);

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
		if (!prompt.trim() || loading) return;
		stopPreview();
		editing = false;
		loading = true;
		error = '';
		details = [];
		result = null;
		try {
			result = await requestExercise(prompt, settings.lang, range);
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

<svelte:window onkeydown={onKey} />

<div
	class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
	role="presentation"
	onclick={(e) => e.target === e.currentTarget && onClose()}
>
	<div
		class="w-full max-w-lg rounded-lg border border-border bg-surface p-5 shadow-xl"
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
		<p class="mt-1 text-sm text-muted">{t('create.intro')}</p>

		<textarea
			bind:value={prompt}
			rows="3"
			maxlength="1000"
			placeholder={t('create.placeholder')}
			class="mt-3 w-full resize-none rounded-lg border border-border bg-base px-3 py-2 text-sm outline-none focus:border-accent"
			onkeydown={(e) => {
				if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void create();
			}}></textarea>
		<div class="mt-2 flex flex-wrap gap-1.5">
			{#each EXAMPLES as key (key)}
				<button
					class="rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs hover:border-accent/50"
					onclick={() => (prompt = t(key))}>{t(key)}</button
				>
			{/each}
		</div>

		<div class="mt-3 flex justify-end">
			<button
				class="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
				disabled={!prompt.trim() || loading}
				onclick={create}>{loading ? t('create.working') : t('create.submit')}</button
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
	</div>
</div>
