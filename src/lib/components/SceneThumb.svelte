<script lang="ts">
	// Miniatura de un fondo propio (imagen guardada en el dispositivo).
	import { onDestroy } from 'svelte';

	let { image, class: cls = 'h-16' }: { image: Blob; class?: string } = $props();

	let url = $state('');
	$effect(() => {
		const u = URL.createObjectURL(image);
		url = u;
		return () => URL.revokeObjectURL(u);
	});
	onDestroy(() => url && URL.revokeObjectURL(url));
</script>

{#if url}
	<img src={url} alt="" class="w-full rounded-lg object-cover {cls}" />
{/if}
