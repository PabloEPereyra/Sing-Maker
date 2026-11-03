<script lang="ts">
	import '../app.css';
	import '$lib/install.svelte';
	import OrientationGuard from '$lib/components/OrientationGuard.svelte';
	import Tooltip from '$lib/components/Tooltip.svelte';

	let { children } = $props();
</script>

{@render children()}
<OrientationGuard />
<Tooltip />
