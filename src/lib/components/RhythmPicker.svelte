<script lang="ts">
	// Selector de ritmos de la batería: popup con la velocidad (normal o mitad) y los patrones agrupados por
	// compás. Los del compás del ejercicio se pueden elegir; los de otro compás se ven en gris. Los creados con
	// IA (✨) se pueden borrar, y abajo hay un botón para crear uno nuevo con IA.
	import type { DrumResult } from '$lib/ai/drums';
	import type { DrumPattern } from '$lib/audio/drums';
	import { t } from '$lib/i18n';
	import type { MeterId } from '$lib/music/meter';
	import CreateDrumDialog from './CreateDrumDialog.svelte';
	import Icon from './Icon.svelte';

	interface Props {
		/** Ritmos agrupados por compás (de la app y creados). */
		groups: { meter: string; patterns: DrumPattern[] }[];
		/** Compás del ejercicio actual. */
		meter: MeterId;
		/** Ritmo elegido para ese compás. */
		activeId: string;
		/** Batería a la mitad de velocidad. */
		half: boolean;
		onPick: (id: string) => void;
		onDelete: (id: string) => void;
		/** Se creó un ritmo con IA y se quiere usar. */
		onCreate: (result: DrumResult, meter: MeterId) => void;
		onClose: () => void;
	}

	let {
		groups,
		meter,
		activeId,
		half = $bindable(),
		onPick,
		onDelete,
		onCreate,
		onClose
	}: Props = $props();

	let creating = $state(false);

	/** Nombre de los ritmos de fábrica en el idioma de la app. */
	const BUILTIN = {
		'basic-44': 'rhythm.basic',
		'basic-68': 'rhythm.basic',
		'rock-44': 'rhythm.rock',
		'rock-fill-44': 'rhythm.rockFill',
		'ballad-68': 'rhythm.ballad'
	} as const;

	const rhythmName = (p: DrumPattern) =>
		p.id in BUILTIN
			? t(BUILTIN[p.id as keyof typeof BUILTIN])
			: p.name.replace(/\s*(4\/4|6\/8)\s*/, ' ').trim();
</script>

<!-- Escape cierra primero el creador (si está abierto) y después el popup -->
<svelte:window
	onkeydown={(e) => e.key === 'Escape' && (creating ? (creating = false) : onClose())}
/>

<div
	class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
	role="presentation"
	onclick={(e) => e.target === e.currentTarget && onClose()}
>
	<div
		class="flex max-h-[92vh] w-full max-w-sm flex-col overflow-hidden bg-surface text-fg"
		role="dialog"
		aria-modal="true"
		aria-labelledby="rhythms-title"
	>
		<div class="ribbon flex items-center justify-between px-4 py-2.5">
			<h3 id="rhythms-title" class="text-xl leading-tight">{t('rhythms.title')}</h3>
			<button
				class="grid h-8 w-8 place-items-center rounded-lg text-lg hover:bg-white/20"
				aria-label={t('range.close')}
				onclick={onClose}>✕</button
			>
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto p-4 pt-3">
			<div class="mb-1 text-sm text-muted">{t('rhythms.speed')}</div>
			<div class="pill-group !h-9 w-full" role="group" aria-label={t('rhythms.speed')}>
				{#each [[false, 'rhythms.speedNormal'], [true, 'rhythms.speedHalf']] as const as [value, label] (label)}
					<button
						class="flex-1 px-1 text-[1.05rem] transition {half === value
							? 'bg-accent text-white'
							: 'hover:bg-surface-2'}"
						aria-pressed={half === value}
						onclick={() => (half = value)}
					>
						{t(label)}
					</button>
				{/each}
			</div>

			{#each groups as g (g.meter)}
				{@const active = g.meter === meter}
				<div class="mt-3 mb-0.5 text-lg {active ? 'text-accent-dark' : 'text-muted'}">
					{g.meter}
				</div>
				{#each g.patterns as p (p.id)}
					{@const own = p.id.startsWith('my-drum-')}
					<div class="mt-1 flex items-stretch gap-1">
						<button
							class="ex-card !mt-0 min-w-0 flex-1 !text-[0.95rem] {active && p.id === activeId
								? 'ex-card-on'
								: ''}"
							aria-pressed={active && p.id === activeId}
							disabled={!active}
							onclick={() => onPick(p.id)}
						>
							<span class="min-w-0 flex-1 truncate">{own ? '✨ ' : ''}{rhythmName(p)}</span>
						</button>
						{#if own}
							<button
								class="trash-btn"
								aria-label={t('create.delete')}
								title={t('create.delete')}
								onclick={() => onDelete(p.id)}
							>
								<Icon name="trash" class="h-4 w-4" />
							</button>
						{/if}
					</div>
				{/each}
			{/each}

			<button
				class="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-[1.05rem] text-white"
				aria-haspopup="dialog"
				onclick={() => (creating = true)}
			>
				<Icon name="wand" class="h-5 w-5" />
				{t('rhythms.create')}
			</button>
		</div>
	</div>
</div>

{#if creating}
	<CreateDrumDialog
		{meter}
		onUse={(result, m) => {
			creating = false;
			onCreate(result, m);
		}}
		onClose={() => (creating = false)}
	/>
{/if}
