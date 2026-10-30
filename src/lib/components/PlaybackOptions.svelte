<script lang="ts">
	// Un solo botón para lo que se toca poco durante el ejercicio: piano guía, batería, tempo y zoom.
	// Despliega un panel arriba y se cierra al tocar fuera; abierto, lleva el contorno blanco de los
	// botones del menú del escenario.
	import { onMount } from 'svelte';
	import { loadDrums } from '$lib/audio/engine';
	import { settings, ZOOM_MAX, ZOOM_MIN } from '$lib/settings.svelte';
	import { t } from '$lib/i18n';
	import Icon from './Icon.svelte';

	let {
		bpm = $bindable(),
		bpmMin,
		bpmMax,
		guide = $bindable(),
		drums = $bindable()
	}: { bpm: number; bpmMin: number; bpmMax: number; guide: boolean; drums: boolean } = $props();

	const ZOOM_STEP = 1.25;

	let open = $state(false);
	let root: HTMLDivElement;

	onMount(() => {
		const close = (e: PointerEvent) => {
			if (open && !root.contains(e.target as Node)) open = false;
		};
		document.addEventListener('pointerdown', close);
		return () => document.removeEventListener('pointerdown', close);
	});

	function zoomBy(factor: number) {
		settings.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, settings.zoom * factor));
	}

	function toggleDrums() {
		drums = !drums;
		if (drums) void loadDrums();
	}
</script>

{#snippet toggle(icon: 'piano' | 'drum', label: string, on: boolean, onclick: () => void)}
	<button
		class="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-semibold transition {on
			? 'border-accent bg-accent text-white'
			: 'border-border bg-surface text-muted hover:border-accent/50'}"
		aria-pressed={on}
		{onclick}
	>
		<Icon name={icon} class="h-5 w-5" />
		<span class="flex-1">{label}</span>
	</button>
{/snippet}

<div bind:this={root} class="relative">
	<button
		class="grid h-12 w-12 place-items-center rounded-full bg-accent text-white shadow hover:brightness-110 {open
			? 'outline-4 outline-white/90'
			: ''}"
		aria-label={t('controls.options')}
		title={t('controls.options')}
		data-tip="options"
		aria-expanded={open}
		onclick={() => (open = !open)}
	>
		<Icon name="sliders" class="h-5 w-5" />
	</button>
	{#if open}
		<div
			class="absolute right-0 bottom-full z-40 mb-3 w-72 space-y-3 rounded-lg border border-border bg-surface p-3 shadow-xl"
		>
			<div class="grid grid-cols-2 gap-2">
				{@render toggle('piano', t('controls.guide'), guide, () => (guide = !guide))}
				{@render toggle('drum', t('controls.drums'), drums, toggleDrums)}
			</div>
			<label class="block">
				<span class="mb-2 block text-xs text-muted">{t('controls.tempo')} · {bpm} bpm</span>
				<input
					type="range"
					min={bpmMin}
					max={bpmMax}
					step="5"
					bind:value={bpm}
					class="vx-slider w-full"
					style:--fill="{((bpm - bpmMin) / (bpmMax - bpmMin)) * 100}%"
				/>
			</label>
			<div role="group" aria-label={t('zoom.label')}>
				<span class="mb-2 block text-xs text-muted">{t('zoom.label')}</span>
				<div class="flex items-center overflow-hidden rounded-lg border border-border bg-surface-2">
					<button
						class="grid h-8 w-10 place-items-center text-lg font-bold hover:bg-border disabled:opacity-40"
						aria-label={t('zoom.out')}
						title={t('zoom.out')}
						disabled={settings.zoom <= ZOOM_MIN + 0.01}
						onclick={() => zoomBy(1 / ZOOM_STEP)}>−</button
					>
					<button
						class="h-8 flex-1 px-1 text-xs font-semibold tabular-nums hover:bg-border"
						title={t('zoom.reset')}
						onclick={() => (settings.zoom = 1)}>{Math.round(settings.zoom * 100)}%</button
					>
					<button
						class="grid h-8 w-10 place-items-center text-lg font-bold hover:bg-border disabled:opacity-40"
						aria-label={t('zoom.in')}
						title={t('zoom.in')}
						disabled={settings.zoom >= ZOOM_MAX - 0.01}
						onclick={() => zoomBy(ZOOM_STEP)}>+</button
					>
				</div>
			</div>
		</div>
	{/if}
</div>
