<script lang="ts">
	// Símbolo de cada nivel de afinación: un diamante tallado con un color propio por nivel
	// (Fácil amarillo, Normal verde, Difícil rojo, Experto azul). Las facetas se logran con capas
	// translúcidas de blanco y negro sobre el color base.
	import type { Difficulty } from '$lib/game/difficulty';

	let { level, class: cls = 'h-6 w-6' }: { level: Difficulty; class?: string } = $props();

	const COLOR: Record<Difficulty, string> = {
		easy: '#facc15',
		normal: '#22c55e',
		hard: '#ef4444',
		expert: '#3b82f6'
	};
	const color = $derived(COLOR[level]);
</script>

<svg class={cls} viewBox="0 0 24 24" aria-hidden="true" stroke-linejoin="round">
	<!-- Cuerpo -->
	<polygon points="6,2.5 18,2.5 23,9 12,22 1,9" fill={color} />
	<!-- Corona: mesa y laterales -->
	<polygon points="6,2.5 18,2.5 15.5,9 8.5,9" fill="#fff" opacity="0.5" />
	<polygon points="6,2.5 8.5,9 1,9" fill="#fff" opacity="0.22" />
	<polygon points="18,2.5 23,9 15.5,9" fill="#000" opacity="0.08" />
	<!-- Pabellón: más oscuro hacia la punta -->
	<polygon points="1,9 8.5,9 12,22" fill="#000" opacity="0.12" />
	<polygon points="8.5,9 15.5,9 12,22" fill="#fff" opacity="0.1" />
	<polygon points="15.5,9 23,9 12,22" fill="#000" opacity="0.28" />
	<!-- Contorno y brillo -->
	<polygon
		points="6,2.5 18,2.5 23,9 12,22 1,9"
		fill="none"
		stroke="#fff"
		stroke-width="1.2"
		opacity="0.9"
	/>
	<path d="M8 4.6 6.4 7.2" stroke="#fff" stroke-width="1.3" stroke-linecap="round" opacity="0.95" />
</svg>
