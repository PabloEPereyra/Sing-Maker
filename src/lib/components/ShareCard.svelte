<script lang="ts">
	// Tarjeta del final de un ejercicio, lista para guardar o compartir como imagen. Se arma en el navegador
	// (ver `share/card.ts`); no usa IA.
	import { onMount } from 'svelte';
	import { cardFile, composeCard, type CardInfo } from '$lib/share/card';
	import { t } from '$lib/i18n';
	import Icon from './Icon.svelte';

	interface Props {
		/** Canvas del juego: de ahí sale la escena con el personaje y el fondo elegidos. */
		scene: HTMLCanvasElement | null;
		info: CardInfo;
		onClose: () => void;
	}

	let { scene, info, onClose }: Props = $props();

	let file = $state<File | null>(null);
	let url = $state('');
	let failed = $state(false);
	let canShare = $state(false);

	const name = $derived(`sing-maker-${info.pct}.png`);

	onMount(() => {
		let objectUrl = '';
		void (async () => {
			try {
				const card = await composeCard(scene, info);
				file = await cardFile(card, name);
				objectUrl = URL.createObjectURL(file);
				url = objectUrl;
				canShare = !!navigator.canShare?.({ files: [file] });
			} catch {
				failed = true;
			}
		})();
		return () => objectUrl && URL.revokeObjectURL(objectUrl);
	});

	function download() {
		if (!url) return;
		const a = document.createElement('a');
		a.href = url;
		a.download = name;
		a.click();
	}

	async function share() {
		if (!file) return;
		try {
			await navigator.share({ files: [file], title: info.title });
		} catch {
			// la persona cerró el menú de compartir: no es un error
		}
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onClose()} />

<div
	class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
	role="presentation"
	onclick={(e) => e.target === e.currentTarget && onClose()}
>
	<div
		class="flex max-h-[94vh] w-full max-w-md flex-col overflow-hidden bg-surface text-fg short:max-w-3xl"
		role="dialog"
		aria-modal="true"
		aria-labelledby="card-title"
	>
		<div class="ribbon flex items-center justify-between px-4 py-2.5">
			<h3 id="card-title" class="text-xl leading-tight">{t('card.title')}</h3>
			<button
				class="grid h-8 w-8 place-items-center rounded-lg text-lg hover:bg-white/20"
				aria-label={t('range.close')}
				onclick={onClose}>✕</button
			>
		</div>
		<div class="flex min-h-0 flex-1 flex-col gap-3 p-4 short:flex-row short:p-3">
			<div class="grid min-h-0 flex-1 place-items-center">
				{#if url}
					<img
						src={url}
						alt={t('card.alt', { name: info.title, pct: info.pct })}
						class="max-h-[60vh] w-auto rounded-lg border-2 border-frame shadow-md short:max-h-[78vh]"
					/>
				{:else if failed}
					<p class="py-10 text-center text-muted">{t('card.error')}</p>
				{:else}
					<p class="py-10 text-center text-muted">{t('card.making')}</p>
				{/if}
			</div>
			<div class="flex flex-col justify-center gap-2 short:w-44">
				<button
					class="flex items-center justify-center gap-2 rounded-lg bg-accent px-5 py-2 text-[1.05rem] text-white disabled:opacity-50"
					disabled={!url}
					onclick={download}
				>
					<Icon name="download" class="h-4 w-4" />
					{t('card.download')}
				</button>
				{#if canShare}
					<button
						class="browser-btn flex items-center justify-center gap-2 px-5 py-2 text-[1.05rem]"
						onclick={share}
					>
						<Icon name="share" class="h-4 w-4" />
						{t('card.share')}
					</button>
				{/if}
			</div>
		</div>
	</div>
</div>
