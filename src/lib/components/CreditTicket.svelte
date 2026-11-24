<script lang="ts">
	// Créditos de IA en la pantalla del juego, a la izquierda del diamante (fuera de los ejercicios): el saldo de la
	// cuenta o, sin sesión, los créditos de regalo por crearla. Al tocarlo se abre el perfil, donde está «Tu cuenta».
	import { onMount } from 'svelte';
	import { age, ageStatus } from '$lib/age.svelte';
	import { t } from '$lib/i18n';
	import { refreshWallet, ticketFor, wallet } from '$lib/wallet.svelte';
	import Ticket from './Ticket.svelte';

	let { onOpen }: { onOpen: () => void } = $props();

	const info = $derived(ticketFor(wallet.report, age.status));
	const label = $derived(
		!info
			? ''
			: info.kind === 'gift'
				? t('wallet.claim', { n: info.credits })
				: t(info.low ? 'wallet.hudLow' : 'wallet.hud', { n: info.credits })
	);

	onMount(() => {
		// Quien declaró ser menor no usa la IA: no hace falta pedir el saldo.
		if (ageStatus() !== 'minor' && wallet.mode === 'unknown') void refreshWallet();
	});
</script>

{#if info}
	<button
		class="hud-score pointer-events-auto flex min-h-9 min-w-9 items-center justify-center gap-1.5 whitespace-nowrap hover:brightness-110 short:min-h-7 short:min-w-7 short:gap-0.5"
		title={label}
		aria-label={label}
		onclick={onOpen}
	>
		<span class="hud-3d inline-flex"><Ticket class="h-9 w-12 short:h-6 short:w-7.5" /></span>
		{#if info.kind === 'balance'}
			<span
				class="text-2xl tabular-nums short:text-[1rem] {info.low
					? '[-webkit-text-stroke-color:#dc2626]'
					: ''}">{info.credits}</span
			>
		{:else}
			<!-- En pantallas bajas solo entra el ticket -->
			<span class="text-lg short:hidden">{t('wallet.hudGift', { n: info.credits })}</span>
		{/if}
	</button>
{/if}
