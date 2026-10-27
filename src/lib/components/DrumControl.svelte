<script lang="ts">
	// Batería: botón para activarla, selector del patrón (menú propio, con los estilos de la app) y
	// «/2», que la pasa a la mitad de velocidad (en ritmos rápidos suena más natural: las negras de la
	// melodía se sienten como corcheas). Los patrones creados con IA se pueden borrar desde el menú.
	import { onMount } from 'svelte';
	import type { DrumPattern } from '$lib/audio/drums';
	import { t } from '$lib/i18n';
	import Icon from './Icon.svelte';

	let {
		enabled,
		half,
		patterns,
		value,
		custom,
		onToggle,
		onPick,
		onHalf,
		onRemove
	}: {
		enabled: boolean;
		half: boolean;
		patterns: DrumPattern[];
		value: string;
		/** Ids de los patrones creados por la persona (los únicos que se pueden borrar). */
		custom: Set<string>;
		onToggle: () => void;
		onPick: (id: string) => void;
		onHalf: () => void;
		onRemove: (id: string) => void;
	} = $props();

	let open = $state(false);
	let root: HTMLDivElement;
	const current = $derived(patterns.find((p) => p.id === value) ?? patterns[0]);

	onMount(() => {
		const close = (e: PointerEvent) => {
			if (open && !root.contains(e.target as Node)) open = false;
		};
		const esc = (e: KeyboardEvent) => e.key === 'Escape' && (open = false);
		document.addEventListener('pointerdown', close);
		document.addEventListener('keydown', esc);
		return () => {
			document.removeEventListener('pointerdown', close);
			document.removeEventListener('keydown', esc);
		};
	});
</script>

<div
	bind:this={root}
	class="relative flex items-center rounded-full border transition {enabled
		? 'border-accent bg-accent text-white'
		: 'border-border bg-surface text-muted'}"
>
	<button
		class="grid h-11 w-11 shrink-0 place-items-center rounded-full {enabled ? '' : 'hover:text-fg'}"
		aria-pressed={enabled}
		aria-label={t('controls.drums')}
		title={t('controls.drums')}
		onclick={onToggle}
	>
		<Icon name="drum" class="h-5 w-5" />
	</button>

	<button
		class="flex h-8 max-w-32 items-center gap-1 rounded-full px-2 text-xs font-semibold transition {enabled
			? 'hover:bg-white/15'
			: 'hover:bg-surface-2 hover:text-fg'}"
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-label={t('controls.drumPattern')}
		title={t('controls.drumPattern')}
		onclick={() => (open = !open)}
	>
		<span class="truncate">{current?.name}</span>
		<svg
			class="h-3 w-3 shrink-0 transition {open ? 'rotate-180' : ''}"
			viewBox="0 0 12 12"
			fill="none"
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
			aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" /></svg
		>
	</button>

	<button
		class="mx-1 grid h-8 min-w-8 shrink-0 place-items-center rounded-full px-1.5 text-xs font-extrabold transition {half
			? enabled
				? 'bg-white text-accent'
				: 'bg-accent text-white'
			: enabled
				? 'hover:bg-white/15'
				: 'hover:bg-surface-2 hover:text-fg'}"
		aria-pressed={half}
		aria-label={t('controls.drumHalf')}
		title={t('controls.drumHalf')}
		onclick={onHalf}
	>
		/2
	</button>

	{#if open}
		<div
			class="absolute bottom-full left-0 z-40 mb-2 max-h-72 w-60 overflow-y-auto rounded-lg border border-border bg-surface p-1.5 text-fg shadow-xl"
			role="listbox"
			aria-label={t('controls.drumPattern')}
		>
			{#each patterns as p (p.id)}
				<div class="group/item flex items-center gap-1">
					<button
						class="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition {p.id ===
						current?.id
							? 'bg-accent font-semibold text-white'
							: 'hover:bg-surface-2'}"
						role="option"
						aria-selected={p.id === current?.id}
						onclick={() => {
							onPick(p.id);
							open = false;
						}}
					>
						<span class="truncate">{p.name}</span>
						{#if custom.has(p.id)}
							<span
								class="ml-auto shrink-0 text-xs {p.id === current?.id
									? 'text-white/80'
									: 'text-muted'}">✨</span
							>
						{/if}
					</button>
					{#if custom.has(p.id)}
						<button
							class="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted opacity-0 group-hover/item:opacity-100 hover:bg-surface-2 hover:text-red-600 focus-visible:opacity-100"
							aria-label={t('create.delete')}
							title={t('create.delete')}
							onclick={() => onRemove(p.id)}>✕</button
						>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
