<script lang="ts">
	import LegalPage from '$lib/components/LegalPage.svelte';
	import { termsDoc } from '$lib/legal';
</script>

<LegalPage doc={termsDoc} other="privacy" />
