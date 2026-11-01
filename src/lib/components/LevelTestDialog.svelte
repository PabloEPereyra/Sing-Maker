<script lang="ts">
	// Test de nivel: explica la prueba y, si ya había una empezada («Continuar luego»), pregunta si se sigue
	// donde se dejó o se empieza de nuevo.
	import { PASS_PERCENT, STAGES } from '$lib/exercises/placement';
	import { t } from '$lib/i18n';
	import HowToPlay from './HowToPlay.svelte';

	let {
		savedStage,
		onStart,
		onClose
	}: {
		/** Etapa en que quedó una prueba empezada (1 a STAGES − 1), o `null` si no hay. */
		savedStage: number | null;
		/** Empieza la prueba; `from` es la etapa con la que arranca (0 = de nuevo). */
		onStart: (from: number) => void;
		onClose: () => void;
	} = $props();
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onClose()} />

<div
	class="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
	role="presentation"
	onclick={(e) => e.target === e.currentTarget && onClose()}
>
	<div
		class="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden bg-surface text-fg"
		role="dialog"
		aria-modal="true"
		aria-labelledby="level-test-title"
	>
		<div class="ribbon flex items-center justify-between px-4 py-2.5">
			<h3 id="level-test-title" class="text-xl leading-tight">{t('onb.level.title')}</h3>
			<button
				class="grid h-8 w-8 place-items-center rounded-lg text-lg hover:bg-white/20"
				aria-label={t('range.close')}
				onclick={onClose}>✕</button
			>
		</div>
		<div class="min-h-0 flex-1 overflow-y-auto p-5">
			{#if savedStage !== null}
				<p class="font-semibold text-accent">
					{t('place.resumeInfo', { n: savedStage + 1, total: STAGES })}
				</p>
				<div class="mt-5 flex flex-col gap-2">
					<button
						class="rounded-lg bg-accent px-5 py-2 text-[1.05rem] text-white"
						onclick={() => onStart(savedStage)}
					>
						{t('place.resume', { n: savedStage + 1 })}
					</button>
					<button
						class="rounded-lg border border-border bg-surface px-5 py-2 text-[1.05rem]"
						onclick={() => onStart(0)}
					>
						{t('place.restart')}
					</button>
				</div>
			{:else}
				<h4 class="text-lg">{t('how.title')}</h4>
				<HowToPlay />
				<p class="mt-5 text-sm text-muted">
					{t('onb.level.body', { pass: PASS_PERCENT, total: STAGES })}
				</p>
				<div class="mt-5 flex justify-end">
					<button
						class="rounded-lg bg-accent px-5 py-2 text-[1.05rem] text-white"
						onclick={() => onStart(0)}
					>
						{t('onb.level.start')}
					</button>
				</div>
			{/if}
		</div>
	</div>
</div>
