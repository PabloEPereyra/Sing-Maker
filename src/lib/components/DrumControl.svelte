<script lang="ts">
	// Batería: dos botones iguales al del piano guía: activarla y «correr», que la pasa a la mitad de velocidad (en ritmos rápidos
	// suena más natural: las negras de la melodía se sienten como corcheas). El patrón se elige en la
	// lista de «Ritmos» del catálogo.
	import { t } from '$lib/i18n';
	import Icon from './Icon.svelte';

	let {
		enabled,
		half,
		onToggle,
		onHalf
	}: {
		enabled: boolean;
		half: boolean;
		onToggle: () => void;
		onHalf: () => void;
	} = $props();
</script>

{#snippet toggle(on: boolean, label: string, icon: 'drum' | 'running', click: () => void)}
	<button
		class="grid h-11 w-11 place-items-center rounded-full border transition {on
			? 'border-accent bg-accent text-white'
			: 'border-border bg-surface text-muted hover:border-accent/50'}"
		aria-pressed={on}
		aria-label={label}
		title={label}
		onclick={click}
	>
		<Icon name={icon} class="h-5 w-5" />
	</button>
{/snippet}

{@render toggle(enabled, t('controls.drums'), 'drum', onToggle)}
{@render toggle(half, t('controls.drumHalf'), 'running', onHalf)}
