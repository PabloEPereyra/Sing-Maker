<script lang="ts">
	// Miniatura de un personaje propio: el primer cuadro de su hoja de "parado".
	import { onDestroy } from 'svelte';
	import type { SheetRecord } from '$lib/character/store.svelte';

	let { sheet, class: cls = 'h-16' }: { sheet: SheetRecord; class?: string } = $props();

	let url = $state('');
	$effect(() => {
		const u = URL.createObjectURL(sheet.blob);
		url = u;
		return () => URL.revokeObjectURL(u);
	});
	onDestroy(() => url && URL.revokeObjectURL(url));
</script>

{#if url}
	<span
		class="block bg-no-repeat {cls}"
		style:aspect-ratio="{sheet.frameWidth} / {sheet.frameHeight}"
		style:background-image="url({url})"
		style:background-size="{sheet.frames * 100}% 100%"
		style:background-position="0 0"
	></span>
{/if}
