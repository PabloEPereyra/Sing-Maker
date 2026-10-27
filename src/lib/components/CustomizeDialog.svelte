<script lang="ts">
	// "Personalizar": personaje y objeto que se recolecta. Más adelante: escenarios y elementos
	// creados por el usuario.
	import {
		settings,
		type CharacterId,
		type CollectibleId,
		type StartId
	} from '$lib/settings.svelte';
	import { t } from '$lib/i18n';

	let { onClose }: { onClose: () => void } = $props();

	const OPTIONS: {
		id: CollectibleId;
		label: 'collectible.starsName' | 'collectible.notesName' | 'collectible.carrotsName';
	}[] = [
		{ id: 'stars', label: 'collectible.starsName' },
		{ id: 'notes', label: 'collectible.notesName' },
		{ id: 'carrots', label: 'collectible.carrotsName' }
	];

	const CHARACTERS: {
		id: CharacterId;
		label: 'character.bird' | 'character.bunny';
		kind: 'character.flyer' | 'character.walker';
		sprite: string;
		aspect: number;
		bg: string;
	}[] = [
		{
			id: 'bird',
			label: 'character.bird',
			kind: 'character.flyer',
			sprite: '/themes/sky/bird-rest.png',
			aspect: 140 / 220,
			bg: 'bg-sky/60'
		},
		{
			id: 'bunny',
			label: 'character.bunny',
			kind: 'character.walker',
			sprite: '/themes/path/bunny-rest.png',
			aspect: 116 / 240,
			bg: 'bg-green-100'
		}
	];

	/** El punto de partida (árbol) solo existe para los voladores; los terrestres salen del sendero. */
	const flyer = $derived(settings.character === 'bird');

	const STARTS: { id: StartId; label: 'start.tree1' | 'start.tree2' }[] = [
		{ id: 'tree1', label: 'start.tree1' },
		{ id: 'tree2', label: 'start.tree2' }
	];

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={onKey} />

<div
	class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
	role="presentation"
	onclick={(e) => e.target === e.currentTarget && onClose()}
>
	<div
		class="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-xl"
		role="dialog"
		aria-modal="true"
		aria-labelledby="customize-title"
	>
		<div class="flex items-center justify-between">
			<h3 id="customize-title" class="text-lg font-bold">{t('customize.title')}</h3>
			<button
				class="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2"
				aria-label={t('range.close')}
				onclick={onClose}>✕</button
			>
		</div>

		<h4 class="mt-4 mb-2 text-xs font-semibold tracking-widest text-muted uppercase">
			{t('customize.character')}
		</h4>
		<div class="grid grid-cols-2 gap-3">
			{#each CHARACTERS as c (c.id)}
				<button
					class="flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition {settings.character ===
					c.id
						? 'border-accent bg-accent/10'
						: 'border-border hover:border-accent/50'}"
					aria-pressed={settings.character === c.id}
					onclick={() => (settings.character = c.id)}
				>
					<div class="grid h-20 w-full place-items-center rounded-lg {c.bg}">
						<img src={c.sprite} alt="" class="h-16 w-auto" style:aspect-ratio={c.aspect} />
					</div>
					<span class="text-sm font-semibold">{t(c.label)}</span>
					<span class="-mt-1.5 text-xs text-muted">{t(c.kind)}</span>
				</button>
			{/each}
		</div>

		{#if flyer}
			<h4 class="mt-5 mb-2 text-xs font-semibold tracking-widest text-muted uppercase">
				{t('customize.start')}
			</h4>
			<div class="grid grid-cols-2 gap-3">
				{#each STARTS as o (o.id)}
					<button
						class="flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition {settings.start ===
						o.id
							? 'border-accent bg-accent/10'
							: 'border-border hover:border-accent/50'}"
						aria-pressed={settings.start === o.id}
						onclick={() => (settings.start = o.id)}
					>
						<div class="grid h-20 w-full place-items-center rounded-lg bg-sky/60">
							<img src="/themes/sky/{o.id}.png" alt="" class="h-[72px] w-auto" />
						</div>
						<span class="text-sm font-semibold">{t(o.label)}</span>
					</button>
				{/each}
			</div>
		{/if}

		<h4 class="mt-5 mb-2 text-xs font-semibold tracking-widest text-muted uppercase">
			{t('customize.collectible')}
		</h4>
		<div class="grid grid-cols-3 gap-3">
			{#each OPTIONS as o (o.id)}
				<button
					class="flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition {settings.collectible ===
					o.id
						? 'border-accent bg-accent/10'
						: 'border-border hover:border-accent/50'}"
					aria-pressed={settings.collectible === o.id}
					onclick={() => (settings.collectible = o.id)}
				>
					<div class="grid h-16 w-full place-items-center rounded-lg bg-sky/60">
						{#if o.id === 'stars'}
							<span class="text-4xl text-star drop-shadow">★ ★</span>
						{:else if o.id === 'notes'}
							<span
								class="block h-12 w-full bg-contain bg-center bg-no-repeat"
								style:background-image="url(/collectibles/notes.png)"
							></span>
						{:else}
							<!-- las dos primeras zanahorias de la tira (la tercera es la de brillos) -->
							<span
								class="block h-12 bg-no-repeat"
								style:aspect-ratio="222 / 160"
								style:background-image="url(/collectibles/carrots.png)"
								style:background-size="150% 100%"
							></span>
						{/if}
					</div>
					<span class="text-sm font-semibold">{t(o.label)}</span>
				</button>
			{/each}
		</div>
		<p class="mt-4 text-xs text-muted">{t('customize.more')}</p>
	</div>
</div>
