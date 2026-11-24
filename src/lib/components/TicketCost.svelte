<script lang="ts">
	// Lo que cuesta crear esto, al lado del título: «= 1 ticket». Con «≈» cuando depende del tipo y de los reintentos
	// (personajes y objetos). Solo se muestra si el sitio cobra con créditos.
	import { t } from '$lib/i18n';
	import { creditCost, isEstimate, wallet, type Spend } from '$lib/wallet.svelte';
	import Ticket from './Ticket.svelte';

	let { spend }: { spend: Spend } = $props();

	const cost = $derived(wallet.report?.auth ? creditCost(spend, wallet.report.costs) : 0);
	const estimate = $derived(isEstimate(spend));
	const label = $derived(
		estimate
			? t('wallet.costsAbout', { n: cost })
			: t(cost === 1 ? 'wallet.costsOne' : 'wallet.costs', { n: cost })
	);
</script>

{#if cost > 0}
	<span
		class="ml-1.5 inline-flex items-center gap-1 align-middle text-[1rem] font-bold whitespace-nowrap"
		role="img"
		title={label}
		aria-label={label}
		>{estimate ? '≈' : '='}
		{cost}<Ticket class="h-4.5 w-6.5" /></span
	>
{/if}
