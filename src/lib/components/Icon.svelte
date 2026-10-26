<script lang="ts">
	// Iconos de la interfaz. Piano y metrónomo son copias de los de vocalizator (src/lib/icons/).
	import piano from '$lib/icons/piano.svg?raw';
	import metronome from '$lib/icons/metronome.svg?raw';

	type Name = 'play' | 'pause' | 'stop' | 'piano' | 'metronome' | 'palette' | 'retry' | 'mic';
	let { name, class: cls = 'h-5 w-5' }: { name: Name; class?: string } = $props();

	const RAW: Partial<Record<Name, string>> = { piano, metronome };
</script>

{#if RAW[name]}
	<span class="inline-block {cls} [&>svg]:h-full [&>svg]:w-full" aria-hidden="true">
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- SVG propio del repo -->
		{@html RAW[name]}
	</span>
{:else}
	<svg class={cls} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
		{#if name === 'play'}
			<path
				d="M8 5.6v12.8c0 .8.9 1.3 1.6.9l10-6.4c.6-.4.6-1.4 0-1.8l-10-6.4C8.9 4.3 8 4.8 8 5.6Z"
			/>
		{:else if name === 'pause'}
			<rect x="6" y="5" width="4.5" height="14" rx="1.5" />
			<rect x="13.5" y="5" width="4.5" height="14" rx="1.5" />
		{:else if name === 'mic'}
			<path
				d="M12 2a3.5 3.5 0 0 0-3.5 3.5v6a3.5 3.5 0 0 0 7 0v-6A3.5 3.5 0 0 0 12 2Zm-6.5 9a1 1 0 0 0-1 1 7.5 7.5 0 0 0 6.5 7.4V21H8.5a1 1 0 1 0 0 2h7a1 1 0 1 0 0-2H13v-1.6a7.5 7.5 0 0 0 6.5-7.4 1 1 0 1 0-2 0 5.5 5.5 0 0 1-11 0 1 1 0 0 0-1-1Z"
			/>
		{:else if name === 'stop'}
			<rect x="6" y="6" width="12" height="12" rx="2" />
		{:else if name === 'retry'}
			<path
				d="M12 5a7 7 0 1 0 6.9 8.2 1 1 0 0 0-2-.4A5 5 0 1 1 12 7h1.6l-1.3 1.3a1 1 0 1 0 1.4 1.4l3-3a1 1 0 0 0 0-1.4l-3-3a1 1 0 1 0-1.4 1.4L13.6 5H12Z"
			/>
		{:else if name === 'palette'}
			<path
				d="M12 3a9 9 0 0 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A4.6 4.6 0 0 0 22 9.8C22 6 17.5 3 12 3Zm-5.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"
			/>
		{/if}
	</svg>
{/if}
