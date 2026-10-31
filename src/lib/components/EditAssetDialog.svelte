<script lang="ts">
	// Edita un objeto o un fondo propio sin volver a generarlo con IA: el nombre y, en los fondos para
	// caminantes, la altura del suelo (por dónde camina el personaje).
	import {
		updateItem,
		updateScene,
		type ItemRecord,
		type SceneRecord
	} from '$lib/character/assets.svelte';
	import { t } from '$lib/i18n';
	import CharacterThumb from './CharacterThumb.svelte';

	/** Lo que se edita: un objeto o un fondo (el diálogo se crea de nuevo para cada edición). */
	type Target = { kind: 'item'; record: ItemRecord } | { kind: 'scene'; record: SceneRecord };

	let { target, onClose }: { target: Target; onClose: () => void } = $props();

	// Los valores del formulario arrancan con los del registro; después los maneja la persona.
	// svelte-ignore state_referenced_locally
	const { kind, record } = target;
	let name = $state(record.name);
	// svelte-ignore state_referenced_locally
	let ground = $state(target.kind === 'scene' ? target.record.ground : 0.8);
	let saving = $state(false);
	let error = $state('');
	let imageUrl = $state('');

	$effect(() => {
		if (kind !== 'scene') return;
		const url = URL.createObjectURL((record as SceneRecord).image);
		imageUrl = url;
		return () => URL.revokeObjectURL(url);
	});

	const walker = $derived(kind === 'scene' && (record as SceneRecord).movement === 'walk');
	const changed = $derived(
		name.trim() !== record.name ||
			(walker && Math.abs(ground - (record as SceneRecord).ground) > 1e-6)
	);

	async function save() {
		if (saving || !name.trim()) return;
		saving = true;
		error = '';
		try {
			const label = name.trim().slice(0, 30);
			if (kind === 'item') await updateItem({ ...(record as ItemRecord), name: label });
			else
				await updateScene({
					...(record as SceneRecord),
					name: label,
					ground: walker ? ground : (record as SceneRecord).ground
				});
			onClose();
		} catch {
			error = t('card.error');
			saving = false;
		}
	}
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onClose()} />

<div
	class="fixed inset-0 z-[60] grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
	role="presentation"
	onclick={(e) => e.target === e.currentTarget && onClose()}
>
	<div
		class="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden bg-surface text-fg"
		role="dialog"
		aria-modal="true"
		aria-labelledby="edit-asset-title"
	>
		<div class="ribbon flex items-center justify-between px-4 py-2.5">
			<h3 id="edit-asset-title" class="text-xl leading-tight">
				{t(kind === 'item' ? 'asset.editItem' : 'asset.editScene')}
			</h3>
			<button
				class="grid h-8 w-8 place-items-center rounded-lg text-lg hover:bg-white/20"
				aria-label={t('range.close')}
				onclick={onClose}>✕</button
			>
		</div>

		<form
			class="min-h-0 flex-1 overflow-y-auto p-4"
			onsubmit={(e) => {
				e.preventDefault();
				void save();
			}}
		>
			{#if kind === 'scene'}
				<div class="relative overflow-hidden rounded-lg border-2 border-frame">
					{#if imageUrl}
						<img src={imageUrl} alt="" class="block aspect-video w-full object-cover" />
					{/if}
					{#if walker}
						<!-- La línea marca por dónde camina el personaje -->
						<div
							class="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-white/90 shadow-[0_1px_0_rgba(0,0,0,0.4)]"
							style:top="{ground * 100}%"
						></div>
					{/if}
				</div>
				{#if walker}
					<label class="mt-3 block">
						<span class="mb-1 flex justify-between text-sm text-muted">
							<span>{t('scene.ground')}</span>
							<span class="font-semibold tabular-nums">{Math.round(ground * 100)} %</span>
						</span>
						<input
							type="range"
							min="0.5"
							max="0.95"
							step="0.005"
							bind:value={ground}
							class="vx-slider w-full"
							style:--fill="{((ground - 0.5) / 0.45) * 100}%"
						/>
					</label>
				{/if}
			{:else}
				<div class="grid h-24 place-items-center rounded-lg border-2 border-frame bg-sky/60">
					<CharacterThumb sheet={(record as ItemRecord).sheet} class="h-16" />
				</div>
			{/if}

			<label class="mt-4 block">
				<span class="mb-1 block text-sm text-muted">{t('asset.name')}</span>
				<input
					bind:value={name}
					maxlength="30"
					class="w-full rounded-lg border-2 border-frame bg-base px-3 py-1.5 outline-none focus:border-accent"
				/>
			</label>
			{#if error}<p role="alert" class="mt-3 text-sm text-red-700">{error}</p>{/if}

			<div class="mt-4 flex justify-end gap-2">
				<button type="button" class="browser-btn px-4 py-2 text-[1.05rem]" onclick={onClose}
					>{t('asset.cancel')}</button
				>
				<button
					type="submit"
					class="rounded-lg bg-accent px-5 py-2 text-[1.05rem] text-white disabled:opacity-50"
					disabled={saving || !changed || !name.trim()}>{t('asset.save')}</button
				>
			</div>
		</form>
	</div>
</div>
