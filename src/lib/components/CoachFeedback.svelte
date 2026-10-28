<script lang="ts">
	// Devolución del entrenador vocal (IA) al terminar un ejercicio: unas frases simples y un paso
	// siguiente (practicar un ejercicio de la lista o crear uno según lo que le costó). Si no hay
	// conexión o la IA falla, no se muestra nada: el resultado del nivel se ve igual.
	import { onDestroy, onMount } from 'svelte';
	import type { CoachResult } from '$lib/ai/coach';
	import { requestCoach } from '$lib/ai/coachClient';
	import type { PerformanceSummary } from '$lib/game/scoring';
	import { noteLabel, settings } from '$lib/settings.svelte';
	import { t } from '$lib/i18n';

	export interface CoachExercise {
		id: string;
		name: string;
		level: string;
		category: string;
	}
	export interface CoachCandidate extends CoachExercise {
		description: string;
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

	let status = $state<'loading' | 'ready' | 'failed'>('loading');
	let result = $state<CoachResult | null>(null);
	const abort = new AbortController();

	const picked = $derived(result ? candidates.find((c) => c.id === result!.exerciseId) : undefined);

	onMount(async () => {
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
					candidates
				},
				abort.signal
			);
			status = 'ready';
		} catch {
			status = 'failed';
		}
	});
	onDestroy(() => abort.abort());
</script>

{#if status === 'loading'}
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
			<span aria-hidden="true">✨</span>
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
				{t('coach.practice', { name: picked.name })}
			</button>
		{:else if result.action === 'create' && result.prompt}
			<button
				class="mt-2 w-full rounded-lg bg-accent px-3 py-2 font-semibold text-white hover:brightness-105"
				onclick={() => onCreate(result!.prompt)}
			>
				✨ {t('coach.create')}
			</button>
		{/if}
	</section>
{/if}
