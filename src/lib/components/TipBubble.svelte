<script lang="ts">
	// Globo de pista que señala un control de la pantalla (por su atributo data-tip) con un aro que
	// late. Se coloca debajo del control o, si no entra, arriba, y sigue al control si la página se mueve.
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n';

	let {
		target,
		text,
		onDismiss,
		onSkipAll
	}: { target: string; text: string; onDismiss: () => void; onSkipAll: () => void } = $props();

	const WIDTH = 280;
	const MARGIN = 12;
	let box = $state<{ x: number; y: number; w: number; h: number } | null>(null);
	let bubbleHeight = $state(110);
	let viewport = $state({ w: 0, h: 0 });

	function measure() {
		const el = document.querySelector<HTMLElement>(`[data-tip="${target}"]`);
		const r = el?.getBoundingClientRect();
		viewport = { w: window.innerWidth, h: window.innerHeight };
		box = r && r.width ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
	}

	onMount(() => {
		measure();
		const timer = setInterval(measure, 300);
		window.addEventListener('resize', measure);
		return () => {
			clearInterval(timer);
			window.removeEventListener('resize', measure);
		};
	});

	const below = $derived(box ? box.y + box.h + bubbleHeight + 24 < viewport.h : true);
	const left = $derived(
		box
			? Math.max(MARGIN, Math.min(viewport.w - WIDTH - MARGIN, box.x + box.w / 2 - WIDTH / 2))
			: MARGIN
	);
	const top = $derived(box ? (below ? box.y + box.h + 14 : box.y - bubbleHeight - 14) : MARGIN);
	const arrowLeft = $derived(
		box ? Math.max(18, Math.min(WIDTH - 18, box.x + box.w / 2 - left)) : 18
	);
</script>

{#if box}
	<div
		class="pointer-events-none fixed z-[70] animate-pulse rounded-full ring-4 ring-accent"
		style:left="{box.x - 4}px"
		style:top="{box.y - 4}px"
		style:width="{box.w + 8}px"
		style:height="{box.h + 8}px"
		aria-hidden="true"
	></div>
	<div
		class="tip-bubble fixed z-[70] rounded-lg p-3 text-sm"
		style:left="{left}px"
		style:top="{top}px"
		style:width="{WIDTH}px"
		role="status"
		bind:clientHeight={bubbleHeight}
	>
		<span
			class="tip-arrow absolute h-3 w-3 rotate-45"
			style:left="{arrowLeft - 6}px"
			style:top={below ? '-8px' : undefined}
			style:bottom={below ? undefined : '-8px'}
			aria-hidden="true"
		></span>
		<p>{text}</p>
		<div class="mt-2 flex items-center justify-between gap-2">
			<button class="text-xs text-muted underline hover:text-fg" onclick={onSkipAll}>
				{t('tip.skipAll')}
			</button>
			<button
				class="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-white"
				onclick={onDismiss}
			>
				{t('tip.ok')}
			</button>
		</div>
	</div>
{/if}
