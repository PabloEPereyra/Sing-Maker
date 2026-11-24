<script lang="ts">
	// Lo que le queda a la persona, al lado del botón de crear (el costo va junto al título, ver TicketCost):
	// créditos si tiene cuenta, el cupo gratis que le queda si no, o la invitación a crear la cuenta para recibir créditos de
	// regalo (con el campo del email ahí mismo). Sin servidor de cupos no muestra nada.
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n';
	import { allowanceFor, isEstimate, refreshWallet, wallet, type Spend } from '$lib/wallet.svelte';
	import LoginForm from './LoginForm.svelte';
	import Ticket from './Ticket.svelte';

	let { spend }: { spend: Spend } = $props();

	const info = $derived(allowanceFor(wallet.report, spend));
	let open = $state(false);

	onMount(() => {
		void refreshWallet();
	});
</script>

{#if info}
	<div
		class="mt-3 rounded-lg border px-3 py-2 text-xs {info.kind === 'claim' || info.kind === 'out'
			? 'border-accent/50 bg-accent/5'
			: 'border-border bg-surface-2'}"
		role="status"
	>
		<div class="flex flex-wrap items-center gap-x-2 gap-y-1">
			<Ticket class="h-4 w-6 shrink-0" />
			{#if info.kind === 'credits'}
				<span>{t('wallet.balance', { n: info.credits })}</span>
				{#if info.credits < info.cost}
					<span class="font-semibold text-red-600"
						>{t(isEstimate(spend) ? 'wallet.mayNotBeEnough' : 'wallet.notEnough')}</span
					>
				{/if}
			{:else if info.kind === 'free'}
				<span>{t(`wallet.free.${spend}`, { left: info.left, limit: info.limit })}</span>
				{#if info.welcome > 0}
					<button
						class="font-semibold text-accent underline hover:brightness-110"
						onclick={() => (open = !open)}>{t('wallet.claimShort', { n: info.welcome })}</button
					>
				{/if}
			{:else if info.kind === 'claim'}
				<span class="font-semibold">{t('wallet.claim', { n: info.welcome })}</span>
			{:else}
				<span class="font-semibold"
					>{t(
						`access.quota.${spend === 'exercise' ? 'exercises' : spend === 'scene' ? 'images' : 'characters'}`
					)}</span
				>
			{/if}
		</div>
		{#if info.kind === 'claim' || (info.kind === 'free' && open)}
			<div class="mt-2 flex flex-col gap-1.5">
				<p class="text-muted">{t('wallet.claimHelp', { n: info.welcome })}</p>
				<LoginForm />
			</div>
		{/if}
	</div>
{/if}
