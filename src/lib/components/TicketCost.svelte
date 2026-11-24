<script lang="ts">
	// Lo que cuesta crear esto, al lado del título: «= 1 ticket». Solo se muestra si el sitio cobra con créditos.
	import { t } from '$lib/i18n';
	import { creditCost, wallet, type Spend } from '$lib/wallet.svelte';
	import Ticket from './Ticket.svelte';

	let { spend }: { spend: Spend } = $props();

	const cost = $derived(wallet.report?.auth ? creditCost(spend, wallet.report.costs) : 0);
	const label = $derived(t(cost === 1 ? 'wallet.costsOne' : 'wallet.costs', { n: cost }));
</script>

{#if cost > 0}
	<span
		class="ml-1.5 inline-flex items-center gap-1 align-middle text-[1em] font-bold whitespace-nowrap"
		role="img"
		title={label}
		aria-label={label}
		>=
		{cost}<Ticket class="h-6 w-8" /></span
	>
{/if}
