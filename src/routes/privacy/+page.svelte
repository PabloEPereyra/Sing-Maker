<script lang="ts">
	import LegalPage from '$lib/components/LegalPage.svelte';
	import { privacyDoc } from '$lib/legal';
</script>

<LegalPage doc={privacyDoc} current="privacy" />
