<script lang="ts">
	// Símbolo de los créditos de IA: dos tickets azules de papel, uno sobre otro, con las esquinas mordidas, los
	// lados perforados, un marco y un destello; sin texto. No es una moneda para que no parezca algo que se junta
	// cantando. El borde blanco los separa del cielo y de las barras azules.
	let { class: cls = 'h-5 w-7' }: { class?: string } = $props();

	/** Un ticket de 28×15 centrado en el origen. */
	const SHAPE = `M-11.5-7.5H11.5A2.5 2.5 0 0 0 14-5${'a1 1 0 0 0 0 2'.repeat(5)}A2.5 2.5 0 0 0 11.5 7.5H-11.5A2.5 2.5 0 0 0-14 5${'a1 1 0 0 0 0-2'.repeat(5)}A2.5 2.5 0 0 0-11.5-7.5Z`;
</script>

{#snippet ticket(place: string, paper: string)}
	<g transform={place}>
		<path d={SHAPE} fill="none" stroke="#fff" stroke-width="3" />
		<path d={SHAPE} fill={paper} />
		<rect
			x="-10.8"
			y="-4.9"
			width="21.6"
			height="9.8"
			rx="1.6"
			fill="none"
			stroke="#1e3fd8"
			stroke-width="1.2"
		/>
	</g>
{/snippet}

<svg class={cls} viewBox="1 0 41 31" aria-hidden="true" stroke-linejoin="round">
	{@render ticket('translate(19 14) rotate(-26)', '#3f86dd')}
	{@render ticket('translate(25 20) rotate(-8)', '#62aaf5')}
	<!-- Destello, solo en el de adelante (el otro queda tapado) -->
	<path
		transform="translate(25 20) rotate(-8)"
		d="M0-4.4 1.1-1.1 4.4 0 1.1 1.1 0 4.4-1.1 1.1-4.4 0-1.1-1.1Z"
		fill="#fff"
	/>
</svg>
