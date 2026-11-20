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

<svelte:head>
	<!-- Un solo sitio para los buscadores: la misma página en vocal.quest, venga de la dirección que venga -->
	<link rel="canonical" href={`https://vocal.quest${page.url.pathname}`} />
</svelte:head>

{@render children()}
{#if !legal}
	<OrientationGuard />
{/if}
<Tooltip />
<AgeGate />
