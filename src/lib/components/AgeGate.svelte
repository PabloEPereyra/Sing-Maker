<script lang="ts">
	// Pregunta una vez, antes de la primera llamada a la IA, si la persona tiene 18 años o más (lo exigen los
	// términos de Meta Model API). Se abre desde ensureAdult(); el resto del juego no la necesita.
	import { resolve } from '$app/paths';
	import { age, confirmAdult, declineAdult } from '$lib/age.svelte';
	import { t } from '$lib/i18n';
</script>

<svelte:window onkeydown={(e) => age.asking && e.key === 'Escape' && declineAdult()} />

{#if age.asking}
	<div
		class="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
		role="presentation"
		onclick={(e) => e.target === e.currentTarget && declineAdult()}
	>
		<div
			class="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden bg-surface text-fg"
			role="dialog"
			aria-modal="true"
			aria-labelledby="age-gate-title"
		>
			<div class="ribbon px-4 py-2.5">
				<h3 id="age-gate-title" class="text-xl leading-tight">{t('age.title')}</h3>
			</div>
			<div class="min-h-0 flex-1 overflow-y-auto p-5">
				<p>{t('age.body')}</p>
				<p class="mt-3 text-sm text-muted">{t('age.rest')}</p>
				<p class="mt-3 text-sm text-muted">
					{t('legal.ageAccept')}
					<a class="underline hover:text-fg" href={resolve('/terms')} target="_blank"
						>{t('legal.terms')}</a
					>
					·
					<a class="underline hover:text-fg" href={resolve('/privacy')} target="_blank"
						>{t('legal.privacy')}</a
					>
				</p>
				<div class="mt-5 flex flex-col gap-2">
					<button
						class="rounded-lg bg-accent px-5 py-2 text-[1.05rem] text-white"
						onclick={confirmAdult}
					>
						{t('age.confirm')}
					</button>
					<button
						class="rounded-lg border border-border bg-surface px-5 py-2 text-[1.05rem]"
						onclick={declineAdult}
					>
						{t('age.decline')}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
