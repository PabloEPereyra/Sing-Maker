<script lang="ts">
	// Un solo botón para lo que se toca poco durante el ejercicio: micrófono, piano guía, batería, tempo y zoom.
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
		drums = $bindable(),
		micOn,
		onMic
	}: {
		bpm: number;
		bpmMin: number;
		bpmMax: number;
		guide: boolean;
		drums: boolean;
		micOn: boolean;
		onMic: () => void;
	} = $props();

	/** Pasos del zoom de 10 en 10 puntos porcentuales (100 % = 1). */
	const ZOOM_STEP = 0.1;

	let open = $state(false);
	let root: HTMLDivElement;

	onMount(() => {
		const close = (e: PointerEvent) => {
			if (open && !root.contains(e.target as Node)) open = false;
		};
		document.addEventListener('pointerdown', close);
		return () => document.removeEventListener('pointerdown', close);
	});

	function zoomBy(step: number) {
		// Se redondea a décimas para que 0,1 no acumule error de coma flotante.
		const next = Math.round((settings.zoom + step) * 10) / 10;
		settings.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, next));
	}

	function toggleDrums() {
		drums = !drums;
		if (drums) void loadDrums();
	}
</script>

{#snippet toggle(icon: 'mic' | 'piano' | 'drum', label: string, on: boolean, onclick: () => void)}
	<button
		class="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold {on
			? 'border-accent bg-accent text-white'
			: 'border-border bg-surface text-muted'}"
		aria-pressed={on}
		{onclick}
	>
		<Icon name={icon} class="h-5 w-5" />
		<span class="flex-1">{label}</span>
	</button>
{/snippet}

<div bind:this={root} class="relative">
	<button
		class="grid h-12 w-12 place-items-center rounded-full bg-accent text-white shadow hover:brightness-110 short:h-10 short:w-10 {open
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
			class="panel absolute right-0 bottom-full z-40 mb-4 w-72 space-y-3 p-3"
		>
			{@render toggle('mic', t('controls.mic'), micOn, onMic)}
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
				<div class="flex items-center gap-2">
					<button
						class="grid h-9 w-11 place-items-center rounded-lg border border-border bg-surface text-lg font-bold disabled:opacity-40"
						aria-label={t('zoom.out')}
						title={t('zoom.out')}
						disabled={settings.zoom <= ZOOM_MIN + 0.01}
						onclick={() => zoomBy(-ZOOM_STEP)}>−</button
					>
					<button
						class="h-9 flex-1 rounded-lg border border-border bg-surface-2 px-1 text-sm font-semibold tabular-nums"
						title={t('zoom.reset')}
						onclick={() => (settings.zoom = 1)}>{Math.round(settings.zoom * 100)}%</button
					>
					<button
						class="grid h-9 w-11 place-items-center rounded-lg border border-border bg-surface text-lg font-bold disabled:opacity-40"
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
