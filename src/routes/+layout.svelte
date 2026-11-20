<script lang="ts">
	import '../app.css';
	import '$lib/install.svelte';
	import { page } from '$app/state';
	import AgeGate from '$lib/components/AgeGate.svelte';
	import OrientationGuard from '$lib/components/OrientationGuard.svelte';
	import Tooltip from '$lib/components/Tooltip.svelte';

	let { children } = $props();
	// Términos y privacidad se leen también con el celular en vertical
	const legal = $derived(page.url.pathname === '/terms' || page.url.pathname === '/privacy');
</script>

{@render children()}
{#if !legal}
	<OrientationGuard />
{/if}
<Tooltip />
<AgeGate />
