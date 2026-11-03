<script lang="ts">
	// El juego solo se puede jugar con el celular acostado. En pantallas táctiles en vertical se tapa todo con
	// un aviso para girarlo; además se intenta bloquear la orientación (solo lo permiten algunos navegadores,
	// y en pantalla completa o como app instalada).
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n';
	import { install } from '$lib/install.svelte';

	type Lockable = ScreenOrientation & { lock?: (o: string) => Promise<void> };
	const orientation = (): Lockable | undefined =>
		typeof screen === 'undefined' ? undefined : (screen.orientation as Lockable | undefined);

	/** El botón solo sale donde se puede (Chrome en Android); en iPhone no hay forma de bloquear. */
	let canLock = $state(false);

	/** Bloquea en horizontal; los navegadores lo permiten solo en pantalla completa y tras un toque. */
	async function lockLandscape(fullscreen: boolean) {
		try {
			if (fullscreen && !document.fullscreenElement)
				await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
		} catch {
			// sin pantalla completa: se intenta el bloqueo igual
		}
		try {
			await orientation()?.lock?.('landscape');
		} catch {
			// sin soporte: queda el aviso
		}
	}

	onMount(() => {
		// Instalada como app, el manifiesto ya fija la orientación y no hace falta pasar a pantalla completa
		canLock =
			!install.installed &&
			typeof orientation()?.lock === 'function' &&
			typeof document.documentElement.requestFullscreen === 'function';
		void lockLandscape(false);
		// Algunos navegadores solo dejan bloquear después de un toque
		const onTouch = () => void lockLandscape(false);
		window.addEventListener('pointerdown', onTouch, { once: true });
		return () => window.removeEventListener('pointerdown', onTouch);
	});
</script>

<div class="rotate-guard" role="alert">
	<svg
		viewBox="0 0 64 64"
		class="h-20 w-20"
		fill="none"
		stroke="currentColor"
		stroke-width="3"
		aria-hidden="true"
	>
		<rect x="22" y="6" width="20" height="36" rx="4" />
		<path d="M28 36h8" stroke-linecap="round" />
		<path d="M14 50a22 22 0 0 0 36 0" stroke-linecap="round" />
		<path d="M50 50l-1 8m1-8l-8-1" stroke-linecap="round" stroke-linejoin="round" />
	</svg>
	<h2 class="mt-3 text-3xl">{t('rotate.title')}</h2>
	<p class="mt-1 max-w-xs text-lg opacity-90">{t('rotate.text')}</p>
	{#if canLock}
		<button
			class="mt-5 rounded-lg bg-white px-5 py-2.5 text-lg font-semibold text-accent-dark shadow-lg"
			onclick={() => lockLandscape(true)}
		>
			{t('rotate.fullscreen')}
		</button>
	{/if}
</div>
