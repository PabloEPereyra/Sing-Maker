<script lang="ts">
	// El juego solo se puede jugar con el celular acostado. En pantallas táctiles en vertical se tapa todo con
	// un aviso para girarlo; además se intenta bloquear la orientación (solo lo permiten algunos navegadores,
	// y en pantalla completa o como app instalada).
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n';

	onMount(() => {
		const lock = () => {
			try {
				// `lock` no está en los tipos de DOM de todos los navegadores
				void (
					screen.orientation as ScreenOrientation & {
						lock?: (o: string) => Promise<void>;
					}
				)
					.lock?.('landscape')
					?.catch(() => {});
			} catch {
				// sin soporte: queda el aviso
			}
		};
		lock();
		// Algunos navegadores solo dejan bloquear después de un toque
		window.addEventListener('pointerdown', lock, { once: true });
		return () => window.removeEventListener('pointerdown', lock);
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
</div>
