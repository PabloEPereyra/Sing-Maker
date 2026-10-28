<script lang="ts">
	// Perfil al estilo juego de celular: avatar redondo arriba a la derecha que abre un menú de
	// configuración. Por ahora, calibración del micrófono; más adelante, opciones compactas para
	// la vista de celular.
	import { onMount } from 'svelte';
	import type { PitchDetector } from '$lib/audio/pitch';
	import { t } from '$lib/i18n';
	import Icon from './Icon.svelte';
	import MicCalibration from './MicCalibration.svelte';
	import SyncCalibration from './SyncCalibration.svelte';

	/** `highlight`: señala el menú (se detectó un desfase de voz); se apaga al abrirlo. */
	let {
		getDetector,
		highlight = $bindable(false),
		onGuide
	}: {
		getDetector: () => Promise<PitchDetector | null>;
		highlight?: boolean;
		onGuide: () => void;
	} = $props();

	let open = $state(false);
	let calibrating = $state(false);
	let syncing = $state(false);
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
		class="grid h-11 w-11 place-items-center overflow-hidden rounded-full border-2 border-white bg-gradient-to-b from-sky to-accent shadow-md ring-2 ring-accent transition hover:scale-105"
		aria-label={t('profile.title')}
		aria-expanded={open}
		onclick={() => {
			open = !open;
			highlight = false;
		}}
	>
		<img src="/avatar.png" alt="" class="mt-1.5 h-11 w-11 object-cover" />
	</button>

	{#if highlight && !open}
		<!-- Flecha que señala el menú, para el aviso de desfase del final del ejercicio -->
		<span
			class="pointer-events-none absolute inset-0 animate-ping rounded-full ring-4 ring-accent"
			aria-hidden="true"
		></span>
		<span
			class="pointer-events-none absolute top-full right-1 z-50 mt-1 animate-bounce text-3xl leading-none font-black text-accent drop-shadow"
			aria-hidden="true">↑</span
		>
	{/if}

	{#if open}
		<div
			class="absolute top-full right-0 z-40 mt-2 w-60 rounded-lg border border-border bg-surface p-1.5 text-fg shadow-xl"
		>
			<div class="px-2.5 pt-1.5 pb-1 text-xs font-semibold tracking-widest text-muted uppercase">
				{t('profile.title')}
			</div>
			<button
				class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-surface-2"
				onclick={() => {
					open = false;
					calibrating = true;
				}}
			>
				<Icon name="mic" class="h-4 w-4 text-accent" />
				{t('mic.calibrateItem')}
			</button>
			<button
				class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-surface-2"
				onclick={() => {
					open = false;
					syncing = true;
				}}
			>
				<Icon name="mic" class="h-4 w-4 text-accent" />
				{t('sync.item')}
			</button>
			<button
				class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-surface-2"
				onclick={() => {
					open = false;
					onGuide();
				}}
			>
				<span class="grid h-4 w-4 place-items-center text-accent" aria-hidden="true">?</span>
				{t('onb.reopen')}
			</button>
		</div>
	{/if}
</div>

{#if syncing}
	<SyncCalibration {getDetector} onClose={() => (syncing = false)} />
{/if}

{#if calibrating}
	<MicCalibration {getDetector} onClose={() => (calibrating = false)} />
{/if}
