<script lang="ts">
	// Perfil al estilo juego de celular: avatar redondo arriba a la derecha que abre un menú de
	// configuración. Por ahora, calibración del micrófono; más adelante, opciones compactas para
	// la vista de celular.
	import { onMount } from 'svelte';
	import type { PitchDetector } from '$lib/audio/pitch';
	import { settings } from '$lib/settings.svelte';
	import { DIFFICULTIES } from '$lib/game/difficulty';
	import { t } from '$lib/i18n';
	import AccessCode from './AccessCode.svelte';
	import DifficultyBadge from './DifficultyBadge.svelte';
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
			class="absolute top-full right-0 z-40 mt-2 w-72 rounded-lg border-2 border-frame bg-surface p-2 text-fg shadow-xl"
		>
			<div class="px-2.5 pt-1 pb-1.5 text-xs font-semibold tracking-widest text-muted uppercase">
				{t('profile.title')}
			</div>

			<!-- Ajustes con varias opciones: el mismo encabezado (icono y nombre) y un selector debajo -->
			<div class="menu-row-static">
				{@render head('globe', t('header.language'))}
				<div class="pill-group !h-9 w-full" role="group" aria-label={t('header.language')}>
					{#each ['es', 'en'] as const as lang (lang)}
						<button
							class="flex-1 px-1 text-xs font-semibold uppercase transition {settings.lang === lang
								? 'bg-accent text-white'
								: 'hover:bg-surface-2'}"
							aria-pressed={settings.lang === lang}
							onclick={() => (settings.lang = lang)}
						>
							{lang}
						</button>
					{/each}
				</div>
			</div>
			<div class="menu-row-static">
				{@render head('ruler', t('diff.title'))}
				<div class="pill-group !h-14 w-full" role="group" aria-label={t('diff.title')}>
					{#each DIFFICULTIES as d (d.id)}
						<button
							class="flex flex-1 flex-col items-center justify-center gap-0.5 px-1 text-xs font-semibold transition {settings.difficulty ===
							d.id
								? 'bg-accent text-white'
								: 'hover:bg-surface-2'}"
							aria-pressed={settings.difficulty === d.id}
							onclick={() => (settings.difficulty = d.id)}
						>
							<DifficultyBadge level={d.id} class="h-5 w-5" />
							{t(`diff.${d.id}`)}
						</button>
					{/each}
				</div>
			</div>

			<!-- Interruptor -->
			<button
				class="menu-row"
				role="switch"
				aria-checked={settings.sfx}
				onclick={() => (settings.sfx = !settings.sfx)}
			>
				<Icon name={settings.sfx ? 'volume' : 'volume-off'} class="h-5 w-5 shrink-0 text-accent" />
				<span class="flex-1">{t('sfx.label')}</span>
				<span class="menu-switch" data-on={settings.sfx}><span></span></span>
			</button>

			<AccessCode />

			<div class="my-1.5 h-px bg-border"></div>

			<!-- Acciones: todas con icono de contorno y el mismo alto -->
			<button
				class="menu-row"
				onclick={() => {
					open = false;
					calibrating = true;
				}}
			>
				<Icon name="mic-line" class="h-5 w-5 shrink-0 text-accent" />
				{t('mic.calibrateItem')}
			</button>
			<button
				class="menu-row"
				onclick={() => {
					open = false;
					syncing = true;
				}}
			>
				<Icon name="clock" class="h-5 w-5 shrink-0 text-accent" />
				{t('sync.item')}
			</button>
			<button
				class="menu-row"
				onclick={() => {
					open = false;
					onGuide();
				}}
			>
				<Icon name="help" class="h-5 w-5 shrink-0 text-accent" />
				{t('onb.reopen')}
			</button>
		</div>
	{/if}
</div>

{#snippet head(icon: 'globe' | 'ruler', label: string)}
	<div class="flex items-center gap-2.5 text-sm">
		<Icon name={icon} class="h-5 w-5 shrink-0 text-accent" />
		{label}
	</div>
{/snippet}

{#if syncing}
	<SyncCalibration {getDetector} onClose={() => (syncing = false)} />
{/if}

{#if calibrating}
	<MicCalibration {getDetector} onClose={() => (calibrating = false)} />
{/if}
