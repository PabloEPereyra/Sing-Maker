<script lang="ts">
	// Símbolo de los créditos de IA: un ticket con muescas y un destello, en el mismo estilo que los diamantes de
	// dificultad (capas translúcidas sobre un color base). No es una moneda para que no parezca algo que se junta
	// cantando.
	let { class: cls = 'h-5 w-7' }: { class?: string } = $props();
</script>

<svg class={cls} viewBox="0 0 32 23" aria-hidden="true" stroke-linejoin="round">
	<!-- Cuerpo: las muescas de arriba y abajo separan el talón -->
	<path
		d="M4 1.5h16a2.2 2.2 0 0 0 4.4 0H28a2.5 2.5 0 0 1 2.5 2.5v15a2.5 2.5 0 0 1-2.5 2.5h-3.6a2.2 2.2 0 0 0-4.4 0H4A2.5 2.5 0 0 1 1.5 19V4A2.5 2.5 0 0 1 4 1.5Z"
		fill="#ec4899"
		stroke="#fff"
		stroke-width="1.6"
	/>
	<!-- Luz arriba y sombra abajo -->
	<path
		d="M4 2.6h15.3a3.3 3.3 0 0 0 5.8 0H28A1.5 1.5 0 0 1 29.4 4v4H2.6V4A1.5 1.5 0 0 1 4 2.6Z"
		fill="#fff"
		opacity="0.25"
	/>
	<path
		d="M2.6 15.5h26.8V19a1.5 1.5 0 0 1-1.4 1.4h-2.9a3.3 3.3 0 0 0-5.8 0H4A1.5 1.5 0 0 1 2.6 19Z"
		fill="#000"
		opacity="0.15"
	/>
	<!-- Perforado y destello -->
	<path
		d="M22.2 6.2v10.6"
		fill="none"
		stroke="#fff"
		stroke-width="1.5"
		stroke-dasharray="2 2"
		opacity="0.9"
	/>
	<path d="M11 5.5 12.5 10 17 11.5 12.5 13 11 17.5 9.5 13 5 11.5 9.5 10Z" fill="#fff" />
</svg>
