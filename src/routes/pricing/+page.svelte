<script lang="ts">
	import LegalPage from '$lib/components/LegalPage.svelte';
	import { pricingDoc } from '$lib/legal';
</script>

<LegalPage doc={pricingDoc} current="pricing" />
