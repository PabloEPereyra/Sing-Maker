<script lang="ts">
	// Batería: botón para activarla o apagarla, igual que el del piano guía. El patrón y la velocidad
	// (normal o a la mitad) se eligen en la sección «Ritmos» de la lista.
	import { t } from '$lib/i18n';
	import Icon from './Icon.svelte';

	let { enabled, onToggle }: { enabled: boolean; onToggle: () => void } = $props();
</script>

<button
	class="grid h-11 w-11 place-items-center rounded-full border transition {enabled
		? 'border-accent bg-accent text-white'
		: 'border-border bg-surface text-muted hover:border-accent/50'}"
	aria-pressed={enabled}
	data-tip="drums"
	aria-label={t('controls.drums')}
	title={t('controls.drums')}
	onclick={onToggle}
>
	<Icon name="drum" class="h-5 w-5" />
</button>
