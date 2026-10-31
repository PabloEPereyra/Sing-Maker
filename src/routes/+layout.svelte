<script lang="ts">
	import '../app.css';
	import OrientationGuard from '$lib/components/OrientationGuard.svelte';

	let { children } = $props();
</script>

{@render children()}
<OrientationGuard />
