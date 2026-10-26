<script lang="ts">
	import { onMount } from 'svelte';
	import { Game, type GameOptions, type GameStatus, type PitchSource } from '$lib/game/game';
	import type { Theme } from '$lib/game/theme';
	import type { Sequence } from '$lib/music/generate';
	import { midiToSolfege } from '$lib/music/notes';
	import { scoreByRep } from '$lib/game/scoring';

	interface Props {
		theme: Theme;
		sequence: Sequence;
		options: GameOptions;
		title: string;
		onStart: () => void;
		onNext: () => void;
	}

	let { theme, sequence, options, title, onStart, onNext }: Props = $props();

	let canvas: HTMLCanvasElement;
	let game: Game | null = null;
	let ready = $state(false);
	let status = $state<GameStatus | null>(null);
	let repScores = $state<{ rep: number; collected: number; total: number }[]>([]);

	onMount(() => {
		let disposed = false;
		theme.load().then(() => {
			if (disposed) return;
			game = new Game(canvas, theme, (s) => {
				status = s;
				if (s.phase === 'done' && game) repScores = scoreByRep(game.getStars());
			});
			game.setSequence(sequence, options);
			ready = true;
		});
		return () => {
			disposed = true;
			game?.destroy();
		};
	});

	// Al cambiar ejercicio u opciones se vuelve a preparar la escena.
	$effect(() => {
		const seq = sequence;
		const opts = { ...options };
		if (ready) game?.setSequence(seq, opts);
	});

	export function play(source: PitchSource, latency: number): void {
		game?.start(source, latency);
	}

	export function stop(): void {
		game?.stop();
	}

	const playing = $derived(status?.phase === 'countin' || status?.phase === 'playing');
	const pct = $derived(
		status && status.total ? Math.round((status.collected / status.total) * 100) : 0
	);
</script>

<div
	class="relative h-full w-full overflow-hidden rounded-lg border border-border bg-sky shadow-2xl"
>
	<canvas bind:this={canvas} class="block h-full w-full"></canvas>

	{#if status}
		<!-- HUD -->
		<div
			class="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3"
		>
			<div class="rounded-lg bg-black/30 px-3 py-2 text-white backdrop-blur-sm">
				<div class="text-xs tracking-wide uppercase opacity-80">{title}</div>
				{#if status.reps}
					<div class="text-sm">
						Repetición {status.rep + 1}/{status.reps} · raíz
						<b>{midiToSolfege(sequence.reps[status.rep]?.rootMidi ?? 60)}</b>
					</div>
				{/if}
			</div>
			<div
				class="flex items-center gap-2 rounded-lg bg-black/30 px-3 py-2 text-white backdrop-blur-sm"
			>
				<span class="text-2xl text-star">★</span>
				<span class="text-xl font-bold tabular-nums">{status.collected}</span>
				<span class="text-sm opacity-70">/ {status.total}</span>
			</div>
		</div>

		{#if playing}
			<div class="pointer-events-none absolute inset-x-0 bottom-0 h-1.5 bg-black/20">
				<div
					class="h-full bg-accent transition-[width] duration-200"
					style:width="{status.progress * 100}%"
				></div>
			</div>
			<div
				class="pointer-events-none absolute right-3 bottom-4 rounded-lg bg-black/30 px-2 py-1 text-sm text-white"
			>
				{status.sungMidi === null ? '—' : midiToSolfege(status.sungMidi)}
			</div>
		{/if}

		{#if status.countIn !== null}
			<div class="pointer-events-none absolute inset-0 grid place-items-center">
				<div class="text-8xl font-black text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.4)]">
					{status.countIn}
				</div>
			</div>
		{/if}

		{#if status.phase === 'idle'}
			<div class="absolute inset-0 grid place-items-center bg-black/10">
				{#if sequence.notes.length}
					<button
						class="rounded-lg bg-accent px-8 py-4 text-xl font-bold text-white shadow-lg transition hover:scale-105"
						onclick={onStart}
					>
						▶ Volar
					</button>
				{:else}
					<div class="max-w-sm rounded-lg bg-black/50 p-4 text-center text-white">
						Este ejercicio no entra en el rango elegido. Ampliá el rango de voz.
					</div>
				{/if}
			</div>
		{/if}

		{#if status.phase === 'done'}
			<div class="absolute inset-0 grid place-items-center bg-black/35 p-4 backdrop-blur-[2px]">
				<div class="w-full max-w-md rounded-lg bg-surface/95 p-6 text-center shadow-2xl">
					<div class="text-sm text-muted uppercase">¡Llegaste!</div>
					<div class="my-2 text-5xl font-black">
						<span class="text-star">★</span>
						{status.collected}<span class="text-2xl text-muted">/{status.total}</span>
					</div>
					<div class="mb-4 text-muted">{pct}% de las {theme.collectibles}</div>
					<div class="mb-5 flex h-16 items-end gap-1">
						{#each repScores as r (r.rep)}
							<div
								class="flex-1 rounded-t-lg bg-sky"
								style:height="{Math.max(6, (r.collected / r.total) * 100)}%"
								title="Repetición {r.rep + 1}: {r.collected}/{r.total}"
							></div>
						{/each}
					</div>
					<div class="flex justify-center gap-3">
						<button
							class="rounded-lg bg-surface-2 px-5 py-2 font-semibold hover:bg-border"
							onclick={onStart}
						>
							↻ Repetir
						</button>
						<button
							class="rounded-lg bg-accent px-5 py-2 font-bold text-white hover:brightness-105"
							onclick={onNext}
						>
							Siguiente →
						</button>
					</div>
				</div>
			</div>
		{/if}
	{/if}
</div>
