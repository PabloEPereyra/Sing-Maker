<script lang="ts">
	import Icon from './Icon.svelte';
	// Crear un ritmo de batería con IA, encima del popup de ritmos (ver CreateDrumPanel).
	import type { DrumResult } from '$lib/ai/drums';
	import { t } from '$lib/i18n';
	import type { MeterId } from '$lib/music/meter';
	import CreateDrumPanel from './CreateDrumPanel.svelte';

	let {
		meter,
		onUse,
		onClose
	}: {
		/** Compás con el que arranca el selector (el del ejercicio actual). */
		meter: MeterId;
		onUse: (result: DrumResult, meter: MeterId) => void;
		onClose: () => void;
	} = $props();
</script>

<div
	class="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
	role="presentation"
	onclick={(e) => e.target === e.currentTarget && onClose()}
>
	<div
		class="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden bg-surface text-fg"
		role="dialog"
		aria-modal="true"
		aria-labelledby="create-drums-title"
	>
		<div class="ribbon flex items-center justify-between px-4 py-2.5">
			<h3 id="create-drums-title" class="text-xl leading-tight"><Icon name="sparkles" class="mr-1 inline h-6 w-6 align-text-bottom" />{t('drums.title')}</h3>
			<button
				class="grid h-8 w-8 place-items-center rounded-lg text-lg hover:bg-white/20"
				aria-label={t('range.close')}
				onclick={onClose}>✕</button
			>
		</div>
		<div class="min-h-0 flex-1 overflow-y-auto p-4 pt-2">
			<CreateDrumPanel {meter} {onUse} />
		</div>
	</div>
</div>
