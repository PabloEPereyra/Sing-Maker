<script lang="ts">
	import Icon from './Icon.svelte';
	// Devolución del entrenador vocal al terminar un ejercicio: unas frases simples y un paso siguiente.
	// - Con IA (quien declaró tener 18 años o más, requisito de Meta): practicar un ejercicio de la lista o
	//   crear uno según lo que le costó.
	// - Sin IA (quien declaró ser menor, quien todavía no respondió, o si la IA falla): reglas sobre el mismo
	//   resumen y el ejercicio siguiente de la lista (más difícil, repetir o más fácil). A quien no respondió
	//   se le ofrece además un botón para pedir la versión con IA (que pregunta la edad).
	import { onDestroy, onMount } from 'svelte';
	import type { CoachResult } from '$lib/ai/coach';
	import { requestCoach } from '$lib/ai/coachClient';
	import { age, isAdult } from '$lib/age.svelte';
	import { localCoach } from '$lib/coach/local';
	import type { PerformanceSummary } from '$lib/game/scoring';
	import { noteLabel, settings } from '$lib/settings.svelte';
	import { t } from '$lib/i18n';

	export interface CoachExercise {
		id: string;
		name: string;
		level: string;
		category: string;
		order?: number;
	}
	export interface CoachCandidate extends CoachExercise {
		description: string;
		/** Cómo se nombra en el botón (como en la lista: nivel y número). */
		label?: string;
	}

	let {
		summary,
		exercise,
		candidates,
		desynced,
		onPick,
		onCreate
	}: {
		summary: PerformanceSummary;
		exercise: CoachExercise;
		candidates: CoachCandidate[];
		desynced: boolean;
		onPick: (id: string) => void;
		onCreate: (prompt: string) => void;
	} = $props();

	/** `local`: devolución sin IA; `loading`/`ready`: la de la IA. */
	let status = $state<'local' | 'loading' | 'ready'>(isAdult() ? 'loading' : 'local');
	let result = $state<CoachResult | null>(null);
	const abort = new AbortController();

	const picked = $derived(result ? candidates.find((c) => c.id === result!.exerciseId) : undefined);

	async function ask() {
		status = 'loading';
		try {
			const { weakNotes, ...rest } = summary;
			result = await requestCoach(
				{
					lang: settings.lang,
					exercise,
					summary: {
						...rest,
						weakNotes: weakNotes.map((w) => ({ note: noteLabel(w.midi), percent: w.percent })),
						desynced
					},
					candidates: candidates.map((c) => ({ ...c, label: undefined }))
				},
				abort.signal
			);
			status = 'ready';
		} catch {
			// Sin IA (no respondió la edad, es menor, sin conexión o falló): queda la devolución sin IA.
			status = 'local';
		}
	}

	// Devolución sin IA, con los nombres de nota como se muestran en el juego.
	const listFormat = $derived(
		new Intl.ListFormat(settings.lang, { style: 'long', type: 'conjunction' })
	);
	const local = $derived(
		localCoach(
			{
				...summary,
				weakNotes: summary.weakNotes.map((w) => ({ note: noteLabel(w.midi), percent: w.percent }))
			},
			exercise,
			candidates,
			{ desynced, listNotes: (notes) => listFormat.format(notes) }
		)
	);

	onMount(() => {
		if (status === 'loading') void ask();
	});
	onDestroy(() => abort.abort());
</script>

{#if status === 'local'}
	<section class="mb-4 rounded-lg border border-border bg-surface-2 p-3 text-left text-sm">
		<h4
			class="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-widest text-accent uppercase"
		>
			<Icon name="notebook-pen" class="h-4 w-4" />
			{t('coach.title')}
			{#if local.levelUp}
				<span class="ml-auto rounded-full bg-accent px-2 py-0.5 text-[10px] text-white normal-case">
					{t('coach.levelUp')}
				</span>
			{/if}
		</h4>
		<p>{local.lines.map((l) => t(l.key, l.params)).join(' ')}</p>
		{#if local.next}
			<button
				class="mt-2 w-full rounded-lg bg-accent px-3 py-2 font-semibold text-white hover:brightness-105"
				onclick={() => onPick(local.next!.id)}
			>
				{t('coach.practice', { name: local.next.label ?? local.next.name })}
			</button>
		{/if}
		{#if age.status === 'unknown'}
			<button
				class="mt-2 flex w-full items-center justify-center gap-1.5 text-xs font-semibold text-accent hover:underline"
				onclick={ask}
			>
				<Icon name="sparkles" class="h-3.5 w-3.5" />
				{t('coach.ask')}
			</button>
		{/if}
	</section>
{:else if status === 'loading'}
	<div
		class="mb-4 flex items-center gap-2 rounded-lg bg-accent/10 p-3 text-left text-sm text-muted"
		role="status"
	>
		<svg
			class="h-5 w-5 shrink-0 animate-spin text-accent"
			style:animation-timing-function="steps(8, end)"
			style:animation-duration="1s"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2.4"
			stroke-linecap="round"
			aria-hidden="true"
		>
			<path d="M12 3v5" />
			<path d="M18.4 5.6 15 9" opacity="0.9" />
			<path d="M21 12h-5" opacity="0.8" />
			<path d="M18.4 18.4 15 15" opacity="0.7" />
			<path d="M12 21v-5" opacity="0.6" />
			<path d="M5.6 18.4 9 15" opacity="0.5" />
			<path d="M3 12h5" opacity="0.4" />
			<path d="M5.6 5.6 9 9" opacity="0.3" />
		</svg>
		{t('coach.thinking')}
	</div>
{:else if status === 'ready' && result}
	<section class="mb-4 rounded-lg border border-accent/30 bg-accent/10 p-3 text-left text-sm">
		<h4
			class="mb-1 flex items-center gap-1.5 text-xs font-semibold tracking-widest text-accent uppercase"
		>
			<Icon name="sparkles" class="h-4 w-4" />
			{t('coach.title')}
			{#if result.levelUp}
				<span class="ml-auto rounded-full bg-accent px-2 py-0.5 text-[10px] text-white normal-case">
					{t('coach.levelUp')}
				</span>
			{/if}
		</h4>
		<p>{result.message}</p>
		{#if result.action === 'exercise' && picked}
			<button
				class="mt-2 w-full rounded-lg bg-accent px-3 py-2 font-semibold text-white hover:brightness-105"
				onclick={() => onPick(picked.id)}
			>
				{t('coach.practice', { name: picked.label ?? picked.name })}
			</button>
		{:else if result.action === 'create' && result.prompt}
			<button
				class="mt-2 w-full rounded-lg bg-accent px-3 py-2 font-semibold text-white hover:brightness-105"
				onclick={() => onCreate(result!.prompt)}
			>
				<Icon name="sparkles" class="mr-1 inline h-4 w-4 align-text-bottom" />{t('coach.create')}
			</button>
		{/if}
	</section>
{/if}
