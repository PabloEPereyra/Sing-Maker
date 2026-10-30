<script lang="ts">
	// Rango de voz: popup que se abre al tocar las notas a los lados de la barra de repeticiones. Trae las
	// opciones de Voicexplorer/vocal-scales: grilla manual, medición con sirenas y presets por tipo de voz.
	import RangeMeasure from './RangeMeasure.svelte';
	import { VOICE_PRESETS } from '$lib/exercises/catalog';
	import { NOTE_NAMES } from '$lib/music/notes';
	import { noteLabel, settings, toggleNotation } from '$lib/settings.svelte';
	import { t, tDynamic } from '$lib/i18n';
	import type { PitchDetector } from '$lib/audio/pitch';

	interface Props {
		low: number;
		high: number;
		getDetector: () => Promise<PitchDetector | null>;
		onClose: () => void;
	}

	let { low = $bindable(), high = $bindable(), getDetector, onClose }: Props = $props();

	const MIN_MIDI = 33; // A1
	const SOLFEGE = ['Do', 'Do#', 'Re', 'Re#', 'Mi', 'Fa', 'Fa#', 'Sol', 'Sol#', 'La', 'La#', 'Si'];
	const NOTES = $derived(settings.notation === 'american' ? NOTE_NAMES : SOLFEGE);
	const OCTAVES = [1, 2, 3, 4, 5, 6, 7];

	let showMeasure = $state(false);
	let open = $state<'manual' | 'presets'>('manual');

	function gridClick(midi: number) {
		if (midi < MIN_MIDI) return;
		if (midi < low) low = midi;
		else if (midi > high) high = midi;
		else if (midi - low < high - midi) low = midi;
		else high = midi;
		if (low >= high) high = Math.min(107, low + 1);
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape' && !showMeasure) onClose();
	}
</script>

<svelte:window onkeydown={onKey} />

{#if showMeasure}
	<RangeMeasure bind:low bind:high {getDetector} {onClose} />
{:else}
	<div
		class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
		role="presentation"
		onclick={(e) => e.target === e.currentTarget && onClose()}
	>
		<div
			class="max-h-[92vh] w-full max-w-sm overflow-y-auto bg-surface text-fg"
			role="dialog"
			aria-modal="true"
			aria-labelledby="range-title"
		>
			<div class="ribbon flex items-center justify-between px-4 py-2.5">
				<h3 id="range-title" class="text-xl leading-tight">{t('range.title')}</h3>
				<button
					class="grid h-8 w-8 place-items-center rounded-lg text-lg hover:bg-white/20"
					aria-label={t('range.close')}
					onclick={onClose}>✕</button
				>
			</div>

			<div class="p-4">
				<div class="flex items-center justify-center gap-3">
					{#each [low, high] as m, i (i)}
						{#if i}<span class="text-lg font-bold text-muted">–</span>{/if}
						<button
							type="button"
							class="hud-cap !min-w-24 !text-xl"
							title={t('range.toggleHint')}
							onclick={toggleNotation}>{noteLabel(m)}</button
						>
					{/each}
				</div>

				<div class="mt-5 grid grid-cols-3 gap-2">
					<button
						type="button"
						class="rounded-lg border px-2 py-2 text-xs font-semibold {open === 'manual'
							? 'border-accent bg-accent text-white'
							: 'border-border bg-surface'}"
						aria-pressed={open === 'manual'}
						onclick={() => (open = 'manual')}>{t('range.manual')}</button
					>
					<button
						type="button"
						class="rounded-lg border border-border bg-surface px-2 py-2 text-xs font-semibold"
						onclick={() => (showMeasure = true)}>{t('range.measure')}</button
					>
					<button
						type="button"
						class="rounded-lg border px-2 py-2 text-xs font-semibold {open === 'presets'
							? 'border-accent bg-accent text-white'
							: 'border-border bg-surface'}"
						aria-pressed={open === 'presets'}
						onclick={() => (open = 'presets')}>{t('range.presets')}</button
					>
				</div>

				{#if open === 'manual'}
					<div class="mt-4 grid grid-cols-8 gap-x-1 gap-y-1.5">
						<div></div>
						<div
							class="col-span-7 text-center text-[10px] font-bold tracking-widest text-muted uppercase"
						>
							{t('range.octave')}
						</div>
						<div></div>
						{#each OCTAVES as oct (oct)}
							<div class="text-center text-[10px] font-bold text-muted">{oct}</div>
						{/each}
						{#each NOTES as name, pc (name)}
							<div class="flex h-[26px] items-center text-[9px] font-bold text-muted">{name}</div>
							{#each OCTAVES as oct (oct)}
								{@const midi = (oct + 1) * 12 + pc}
								{@const endpoint = midi === low || midi === high}
								<button
									type="button"
									disabled={midi < MIN_MIDI}
									title={noteLabel(midi)}
									aria-label={noteLabel(midi)}
									onclick={() => gridClick(midi)}
									class="range-cell {endpoint
										? 'range-cell-end'
										: midi > low && midi < high
											? 'range-cell-in'
											: ''}"
								>
									{endpoint ? oct : ''}
								</button>
							{/each}
						{/each}
					</div>
				{:else}
					<div class="mt-4">
						{#each VOICE_PRESETS as p (p.id)}
							<button
								type="button"
								class="ex-card {low === p.low && high === p.high ? 'ex-card-on' : ''}"
								aria-pressed={low === p.low && high === p.high}
								onclick={() => {
									low = p.low;
									high = p.high;
								}}
							>
								<span class="min-w-0 flex-1">{tDynamic(`voice.${p.id}`, p.name)}</span>
								<span class="text-xs tabular-nums opacity-70"
									>{noteLabel(p.low)}–{noteLabel(p.high)}</span
								>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
