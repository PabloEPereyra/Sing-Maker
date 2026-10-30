<script lang="ts">
	// Iconos de la interfaz. Piano y batería son copias de los de vocalizator (src/lib/icons/); running es
	// «user-fast-running» de Flaticon Uicons (solid rounded);
	// back es «left» (solid rounded) y note es «music-note» (solid straight) de Flaticon Uicons; gauge, ruler y los de contorno (mic-line, clock, help, volume, volume-off, globe, trash, key) son trazos de Lucide.
	import piano from '$lib/icons/piano.svg?raw';
	import drum from '$lib/icons/drum.svg?raw';
	import running from '$lib/icons/running.svg?raw';

	type Name =
		| 'play'
		| 'pause'
		| 'stop'
		| 'back'
		| 'piano'
		| 'note'
		| 'drum'
		| 'running'
		| 'palette'
		| 'retry'
		| 'mic'
		| 'gauge'
		| 'ruler'
		| 'mic-line'
		| 'clock'
		| 'help'
		| 'volume'
		| 'volume-off'
		| 'globe'
		| 'trash'
		| 'key';
	let { name, class: cls = 'h-5 w-5' }: { name: Name; class?: string } = $props();

	const RAW: Partial<Record<Name, string>> = { piano, drum, running };
	const STROKE: Name[] = [
		'gauge',
		'ruler',
		'mic-line',
		'clock',
		'help',
		'volume',
		'volume-off',
		'globe',
		'trash',
		'key'
	];
</script>

{#if STROKE.includes(name)}
	<svg
		class={cls}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
	>
		{#if name === 'gauge'}
			<path d="M15.6 2.7a10 10 0 1 0 5.7 5.7" />
			<circle cx="12" cy="12" r="2" />
			<path d="M13.4 10.6 19 5" />
		{:else if name === 'mic-line'}
			<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
			<path d="M19 10v2a7 7 0 0 1-14 0v-2" />
			<path d="M12 19v3" />
		{:else if name === 'clock'}
			<circle cx="12" cy="12" r="10" />
			<path d="M12 6v6l4 2" />
		{:else if name === 'help'}
			<circle cx="12" cy="12" r="10" />
			<path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" />
			<path d="M12 17h.01" />
		{:else if name === 'volume'}
			<path d="M11 5 6 9H2v6h4l5 4V5Z" />
			<path d="M15.5 8.5a5 5 0 0 1 0 7" />
			<path d="M19 5a10 10 0 0 1 0 14" />
		{:else if name === 'volume-off'}
			<path d="M11 5 6 9H2v6h4l5 4V5Z" />
			<path d="m22 9-6 6" />
			<path d="m16 9 6 6" />
		{:else if name === 'trash'}
			<path d="M3 6h18" />
			<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
			<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
			<path d="M10 11v6" />
			<path d="M14 11v6" />
		{:else if name === 'key'}
			<circle cx="7.5" cy="15.5" r="5.5" />
			<path d="m21 2-9.6 9.6" />
			<path d="m15.5 7.5 3 3L22 7l-3-3" />
		{:else if name === 'globe'}
			<circle cx="12" cy="12" r="10" />
			<path d="M2 12h20" />
			<path
				d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z"
			/>
		{:else if name === 'ruler'}
			<path d="M10 15v-3" />
			<path d="M14 15v-3" />
			<path d="M18 15v-3" />
			<path d="M2 8V4" />
			<path d="M22 6H2" />
			<path d="M22 8V4" />
			<path d="M6 15v-3" />
			<rect x="2" y="12" width="20" height="8" rx="2" />
		{/if}
	</svg>
{:else if RAW[name]}
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
		{:else if name === 'back'}
			<path
				d="M10 22Q8.8 22 7.92 21.12L1.2 14.8Q0 13.68 0 12Q0 10.32 1.2 9.2L7.92 2.8Q8.56 2.16 9.44 2Q10.32 1.84 11.16 2.2Q12 2.56 12.48 3.28Q12.96 4 13.04 4.88V6.96H20Q21.68 6.96 22.84 8.16Q24 9.36 24 10.96V12.96Q24 14.64 22.84 15.8Q21.68 16.96 20 16.96H13.04V19.04Q13.04 20 12.52 20.72Q12 21.44 11.12 21.76Q10.64 22 10 22Z"
			/>
		{:else if name === 'note'}
			<path
				d="M15.52 0Q14.48 0 13.76 0.72Q13.04 1.44 13.04 2.48V14.24Q11.44 12.96 9.52 12.96Q8 12.96 6.76 13.72Q5.52 14.48 4.76 15.76Q4 17.04 4 18.52Q4 20 4.76 21.24Q5.52 22.48 6.76 23.24Q8 24 9.48 24Q10.96 24 12.24 23.24Q13.52 22.48 14.28 21.24Q15.04 20 14.96 18.48V2.48Q15.04 2.32 15.16 2.16Q15.28 2 15.52 2H20V0Z"
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
