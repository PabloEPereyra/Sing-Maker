<script lang="ts">
	// Botón circular con icono que despliega un panel arriba (para controles que se tocan poco,
	// como tempo o tolerancia). Se cierra al tocar fuera.
	import { onMount, type Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	let { icon, label, children }: { icon: 'gauge' | 'ruler'; label: string; children: Snippet } =
		$props();

	let open = $state(false);
	let root: HTMLDivElement;

	onMount(() => {
		const close = (e: PointerEvent) => {
			if (open && !root.contains(e.target as Node)) open = false;
		};
		document.addEventListener('pointerdown', close);
		return () => document.removeEventListener('pointerdown', close);
	});
</script>

<div bind:this={root} class="relative">
	<button
		class="grid h-11 w-11 place-items-center rounded-full border transition {open
			? 'border-accent bg-accent text-white'
			: 'border-border bg-surface text-muted hover:border-accent/50'}"
		aria-label={label}
		aria-expanded={open}
		title={label}
		onclick={() => (open = !open)}
	>
		<Icon name={icon} class="h-5 w-5" />
	</button>
	{#if open}
		<div
			class="absolute bottom-full left-1/2 z-40 mb-2 w-56 -translate-x-1/2 rounded-lg border border-border bg-surface p-3 shadow-xl"
		>
			{@render children()}
		</div>
	{/if}
</div>
