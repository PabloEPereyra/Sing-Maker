<script lang="ts">
	// Batería: botón para activarla y «correr», que la pasa a la mitad de velocidad (en ritmos rápidos
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

<div
	class="flex items-center rounded-full border transition {enabled
		? 'border-accent bg-accent text-white'
		: 'border-border bg-surface text-muted'}"
>
	<button
		class="grid h-11 w-11 shrink-0 place-items-center rounded-full {enabled ? '' : 'hover:text-fg'}"
		aria-pressed={enabled}
		aria-label={t('controls.drums')}
		title={t('controls.drums')}
		onclick={onToggle}
	>
		<Icon name="drum" class="h-5 w-5" />
	</button>

	<button
		class="mr-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-full transition {half
			? enabled
				? 'bg-white text-accent'
				: 'bg-accent text-white'
			: enabled
				? 'hover:bg-white/15'
				: 'hover:bg-surface-2 hover:text-fg'}"
		aria-pressed={half}
		aria-label={t('controls.drumHalf')}
		title={t('controls.drumHalf')}
		onclick={onHalf}
	>
		<Icon name="running" class="h-4 w-4" />
	</button>
</div>
