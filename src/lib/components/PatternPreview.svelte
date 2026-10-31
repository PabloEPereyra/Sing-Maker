<script lang="ts">
	// Contorno de un patrón: una barra por nota (alto = altura, ancho = duración); las notas guía, en gris.
	// Lo usan el creador de ejercicios y el visor de ejercicios.
	interface PreviewNote {
		/** Duración en tiempos. */
		d: number;
		/** Semitonos respecto de la raíz. */
		s: number;
		rest?: boolean;
		hint?: boolean;
	}

	let { notes, class: cls = 'h-20 w-full' }: { notes: PreviewNote[]; class?: string } = $props();

	const bars = $derived.by(() => {
		const pitched = notes.filter((n) => !n.rest).map((n) => n.s);
		if (!pitched.length) return [];
		const lo = Math.min(...pitched);
		const hi = Math.max(...pitched);
		const total = notes.reduce((a, n) => a + n.d, 0);
		let x = 0;
		return notes.map((n) => {
			const bar = {
				x: (x / total) * 100,
				w: (n.d / total) * 100,
				y: n.rest ? null : hi === lo ? 50 : 85 - ((n.s - lo) / (hi - lo)) * 70,
				hint: !!n.hint
			};
			x += n.d;
			return bar;
		});
	});
</script>

<svg viewBox="0 0 100 100" preserveAspectRatio="none" class={cls} aria-hidden="true">
	{#each bars as b, i (i)}
		{#if b.y !== null}
			<rect
				x={b.x + 0.3}
				y={b.y - 4}
				width={Math.max(0.6, b.w - 0.6)}
				height="8"
				rx="2"
				class={b.hint ? 'fill-muted/40' : 'fill-accent'}
			/>
		{/if}
	{/each}
</svg>
