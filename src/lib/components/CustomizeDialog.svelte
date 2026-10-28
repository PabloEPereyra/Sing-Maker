<script lang="ts">
	// "Personalizar": personaje y objeto que se recolecta. Más adelante: escenarios y elementos
	// creados por el usuario.
	import {
		settings,
		type CharacterId,
		type CollectibleId,
		type StartId
	} from '$lib/settings.svelte';
	import { t, tDynamic } from '$lib/i18n';
	import {
		addCharacter,
		type CharacterRecord,
		characters,
		CUSTOM_PREFIX,
		MAX_CHARACTERS,
		customId,
		findCharacter,
		isCustomId,
		removeCharacter
	} from '$lib/character/store.svelte';
	import { downloadCharacter } from '$lib/character/export';
	import { ImportError, importCharacter } from '$lib/character/import';
	import CharacterThumb from './CharacterThumb.svelte';
	import CreateCharacterDialog from './CreateCharacterDialog.svelte';
	import CreateItemDialog from './CreateItemDialog.svelte';
	import CreateSceneDialog from './CreateSceneDialog.svelte';
	import SceneThumb from './SceneThumb.svelte';
	import { assets, removeItem, removeScene } from '$lib/character/assets.svelte';

	let creating = $state(false);
	let creatingItem = $state(false);
	let creatingScene = $state(false);
	let editing = $state<CharacterRecord | null>(null);
	let importing = $state(false);
	let importError = $state('');

	/** Sube un .zip exportado antes (o de otra persona) y lo suma a los personajes propios. */
	async function onImport(file: File | undefined) {
		if (!file || importing) return;
		importError = '';
		if (characters.list.length >= MAX_CHARACTERS) {
			importError = t('char.full', { n: MAX_CHARACTERS });
			return;
		}
		importing = true;
		try {
			const rec = await addCharacter(await importCharacter(file));
			settings.character = customId(rec.id);
		} catch (e) {
			importError =
				e instanceof ImportError
					? t(`char.imp.${e.code}` as 'char.imp.notZip')
					: t('char.imp.notZip');
		} finally {
			importing = false;
		}
	}

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
	const flyer = $derived(
		isCustomId(settings.character)
			? findCharacter(settings.character.slice(CUSTOM_PREFIX.length))?.movement === 'fly'
			: settings.character === 'bird'
	);

	/** Copia de un personaje (una variante para retocar sin tocar el original). */
	async function duplicate(c: CharacterRecord) {
		importError = '';
		if (characters.list.length >= MAX_CHARACTERS) {
			importError = t('char.full', { n: MAX_CHARACTERS });
			return;
		}
		// Las hojas son imágenes que no cambian: la copia puede compartirlas.
		const copy = await addCharacter({
			name: `${c.name} (${t('char.copy')})`.slice(0, 30),
			movement: c.movement,
			stand: c.stand,
			move: c.move,
			jump: c.jump,
			meta: c.meta
		});
		settings.character = customId(copy.id);
	}

	/** Fondos propios que sirven para el personaje elegido (los de caminantes tienen sendero). */
	const sceneList = $derived(assets.scenes.filter((s) => s.movement === (flyer ? 'fly' : 'walk')));
	const activeScene = $derived(flyer ? settings.backgroundFly : settings.backgroundWalk);

	function selectScene(id: string) {
		if (flyer) settings.backgroundFly = id;
		else settings.backgroundWalk = id;
	}

	async function removeCustomItem(id: string) {
		if (settings.collectible === `custom:${id}`) settings.collectible = 'stars';
		await removeItem(id);
	}

	async function removeCustomScene(id: string) {
		if (settings.backgroundWalk === id) settings.backgroundWalk = '';
		if (settings.backgroundFly === id) settings.backgroundFly = '';
		await removeScene(id);
	}

	async function remove(id: string) {
		if (settings.character === customId(id)) settings.character = 'bird';
		await removeCharacter(id);
	}

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

		<!-- Personajes creados con IA -->
		<div class="mt-3 grid grid-cols-2 gap-3">
			{#each characters.list as c (c.id)}
				<div class="group/item relative">
					<button
						class="flex w-full flex-col items-center gap-2 rounded-lg border-2 p-3 transition {settings.character ===
						customId(c.id)
							? 'border-accent bg-accent/10'
							: 'border-border hover:border-accent/50'}"
						aria-pressed={settings.character === customId(c.id)}
						onclick={() => (settings.character = customId(c.id))}
					>
						<div
							class="grid h-20 w-full place-items-center rounded-lg {c.movement === 'fly'
								? 'bg-sky/60'
								: 'bg-green-100'}"
						>
							<CharacterThumb sheet={c.stand} class="h-16" />
						</div>
						<span class="max-w-full truncate text-sm font-semibold">{c.name}</span>
						<span class="-mt-1.5 text-xs text-muted"
							>{t(c.movement === 'fly' ? 'character.flyer' : 'character.walker')}</span
						>
					</button>
					<!-- Acciones: exportar, editar y duplicar (los de fábrica no tienen) -->
					<div
						class="absolute top-1.5 left-1.5 flex gap-1 opacity-0 transition group-focus-within/item:opacity-100 group-hover/item:opacity-100 [@media(hover:none)]:opacity-100"
					>
						{#each [{ key: 'char.export', help: 'char.exportHelp', icon: '⬇', run: () => downloadCharacter(c) }, { key: 'char.edit', help: 'char.edit', icon: '✎', run: () => (editing = c) }, { key: 'char.duplicate', help: 'char.duplicate', icon: '⧉', run: () => duplicate(c) }] as a (a.key)}
							<button
								class="grid h-7 w-7 place-items-center rounded-lg bg-surface/80 text-muted hover:text-accent"
								aria-label={tDynamic(a.key)}
								title={tDynamic(a.help)}
								onclick={a.run}>{a.icon}</button
							>
						{/each}
					</div>
					<button
						class="absolute top-1.5 right-1.5 grid h-7 w-7 place-items-center rounded-lg bg-surface/80 text-muted opacity-0 group-hover/item:opacity-100 hover:text-red-600 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
						aria-label={t('char.delete')}
						title={t('char.delete')}
						onclick={() => remove(c.id)}>✕</button
					>
				</div>
			{/each}
			<button
				class="flex min-h-36 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-accent/50 bg-accent/5 p-3 text-sm font-semibold text-accent transition hover:bg-accent/10"
				onclick={() => (creating = true)}
			>
				<span class="text-2xl">✨</span>
				{t('char.createCard')}
			</button>
			<label
				class="flex min-h-20 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border-2 border-dashed border-border p-3 text-sm font-semibold text-muted transition hover:border-accent/50 hover:text-fg"
			>
				<span class="text-xl">⬆</span>
				{importing ? t('char.importing') : t('char.import')}
				<span class="text-[11px] font-normal">{t('char.importHelp')}</span>
				<input
					type="file"
					accept=".zip,application/zip"
					class="sr-only"
					disabled={importing}
					onchange={(e) => {
						onImport(e.currentTarget.files?.[0]);
						e.currentTarget.value = '';
					}}
				/>
			</label>
		</div>
		{#if importError}
			<p role="alert" class="mt-2 text-sm text-red-700">{importError}</p>
		{/if}

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
			{#each assets.items as it (it.id)}
				<div class="group/item relative">
					<button
						class="flex w-full flex-col items-center gap-2 rounded-lg border-2 p-3 transition {settings.collectible ===
						`custom:${it.id}`
							? 'border-accent bg-accent/10'
							: 'border-border hover:border-accent/50'}"
						aria-pressed={settings.collectible === `custom:${it.id}`}
						onclick={() => (settings.collectible = `custom:${it.id}`)}
					>
						<div class="grid h-16 w-full place-items-center rounded-lg bg-sky/60">
							<CharacterThumb sheet={it.sheet} class="h-12" />
						</div>
						<span class="max-w-full truncate text-sm font-semibold">{it.name}</span>
					</button>
					<button
						class="absolute top-1 right-1 grid h-6 w-6 place-items-center rounded-lg bg-surface/80 text-xs text-muted opacity-0 group-hover/item:opacity-100 hover:text-red-600 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
						aria-label={t('item.delete')}
						title={t('item.delete')}
						onclick={() => removeCustomItem(it.id)}>✕</button
					>
				</div>
			{/each}
			<button
				class="flex min-h-28 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-accent/50 bg-accent/5 p-2 text-center text-xs font-semibold text-accent transition hover:bg-accent/10"
				onclick={() => (creatingItem = true)}
			>
				<span class="text-xl">✨</span>
				{t('item.createCard')}
			</button>
		</div>

		<!-- Escenario: el de fábrica o fondos creados con IA para este tipo de personaje -->
		<h4 class="mt-5 mb-2 text-xs font-semibold tracking-widest text-muted uppercase">
			{t('scene.section')}
		</h4>
		<div class="grid grid-cols-3 gap-3">
			<button
				class="flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition {activeScene ===
				''
					? 'border-accent bg-accent/10'
					: 'border-border hover:border-accent/50'}"
				aria-pressed={activeScene === ''}
				onclick={() => selectScene('')}
			>
				<div
					class="grid h-16 w-full place-items-center rounded-lg {flyer
						? 'bg-sky/60'
						: 'bg-green-100'}"
				>
					<span class="text-2xl">{flyer ? '☁️' : '🌲'}</span>
				</div>
				<span class="text-sm font-semibold">{t('scene.original')}</span>
			</button>
			{#each sceneList as sc (sc.id)}
				<div class="group/item relative">
					<button
						class="flex w-full flex-col items-center gap-2 rounded-lg border-2 p-3 transition {activeScene ===
						sc.id
							? 'border-accent bg-accent/10'
							: 'border-border hover:border-accent/50'}"
						aria-pressed={activeScene === sc.id}
						onclick={() => selectScene(sc.id)}
					>
						<SceneThumb image={sc.image} class="h-16" />
						<span class="max-w-full truncate text-sm font-semibold">{sc.name}</span>
					</button>
					<button
						class="absolute top-1 right-1 grid h-6 w-6 place-items-center rounded-lg bg-surface/80 text-xs text-muted opacity-0 group-hover/item:opacity-100 hover:text-red-600 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
						aria-label={t('scene.delete')}
						title={t('scene.delete')}
						onclick={() => removeCustomScene(sc.id)}>✕</button
					>
				</div>
			{/each}
			<button
				class="flex min-h-28 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-accent/50 bg-accent/5 p-2 text-center text-xs font-semibold text-accent transition hover:bg-accent/10"
				onclick={() => (creatingScene = true)}
			>
				<span class="text-xl">✨</span>
				{t('scene.createCard')}
			</button>
		</div>
	</div>
</div>

{#if creating}
	<CreateCharacterDialog onClose={() => (creating = false)} onCreated={() => (creating = false)} />
{/if}

{#if creatingItem}
	<CreateItemDialog
		onClose={() => (creatingItem = false)}
		onCreated={() => (creatingItem = false)}
	/>
{/if}

{#if creatingScene}
	<CreateSceneDialog
		movement={flyer ? 'fly' : 'walk'}
		onClose={() => (creatingScene = false)}
		onCreated={() => (creatingScene = false)}
	/>
{/if}

{#if editing}
	<CreateCharacterDialog
		{editing}
		onClose={() => (editing = null)}
		onCreated={() => (editing = null)}
	/>
{/if}
