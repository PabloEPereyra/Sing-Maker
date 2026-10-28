<script lang="ts">
	import { onMount } from 'svelte';
	import {
		Game,
		type GameOptions,
		type GameStatus,
		type Phase,
		type PitchSource
	} from '$lib/game/game';
	import type { Theme } from '$lib/game/theme';
	import type { Sequence } from '$lib/music/generate';
	import { scoreByRep } from '$lib/game/scoring';
	import { COLLECTIBLES } from '$lib/game/collectibles';
	import { noteLabel, settings, ZOOM_MAX, ZOOM_MIN } from '$lib/settings.svelte';
	import { t } from '$lib/i18n';
	import Icon from './Icon.svelte';

	interface Props {
		theme: Theme;
		sequence: Sequence;
		options: GameOptions;
		title: string;
		/** Sin micrófono: muestra la leyenda de modo demostración. */
		demo: boolean;
		/** Fase del juego, para que la página muestre play o pausa. */
		phase?: Phase;
		/** Al terminar un ejercicio, si la voz parece entrar desfasada (la página señala la configuración). */
		desync?: boolean;
		onStart: () => void;
		onNext: () => void;
	}

	let {
		theme,
		sequence,
		options,
		title,
		demo,
		phase = $bindable('idle'),
		desync = $bindable(false),
		onStart,
		onNext
	}: Props = $props();

	let canvas: HTMLCanvasElement;
	let game = $state<Game | null>(null);
	let status = $state<GameStatus | null>(null);
	let repScores = $state<{ rep: number; collected: number; total: number }[]>([]);

	onMount(() => {
		let disposed = false;
		let created: Game | null = null;
		theme.load().then(() => {
			if (disposed) return;
			created = new Game(canvas, theme, (s) => {
				status = s;
				phase = s.phase;
				if (s.phase === 'done' && created) {
					repScores = scoreByRep(created.getStars());
					desync = created.looksDesynced;
				} else if (s.phase !== 'done') desync = false;
			});
			created.setSequence(sequence, options);
			game = created;
		});
		// La rueda no puede ser pasiva: se evita que la página haga scroll o zoom del navegador.
		canvas.addEventListener('wheel', onWheel, { passive: false });
		return () => {
			canvas.removeEventListener('wheel', onWheel);
			disposed = true;
			created?.destroy();
		};
	});

	// Al cambiar ejercicio u opciones se vuelve a preparar la escena.
	$effect(() => {
		const seq = sequence;
		const opts = { ...options };
		game?.setSequence(seq, opts);
	});

	// Personaje elegido en "Personalizar" (el tema trae su propio sprite).
	$effect(() => {
		const g = game;
		const th = theme;
		th.load().then(() => g?.setTheme(th));
	});

	// Zoom del escenario.
	$effect(() => {
		game?.setZoom(settings.zoom);
	});

	const ZOOM_STEP = 1.25;
	function zoomBy(factor: number) {
		settings.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, settings.zoom * factor));
	}

	// Rueda (el pellizco del trackpad llega como rueda con Ctrl) y pellizco con dos dedos.
	function onWheel(e: WheelEvent) {
		e.preventDefault();
		zoomBy(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
	}
	let touches: { id: number; x: number; y: number }[] = [];
	let pinchStart = 0;
	let zoomAtPinch = 1;
	const spread = () => Math.hypot(touches[0].x - touches[1].x, touches[0].y - touches[1].y);
	function onPointerDown(e: PointerEvent) {
		if (e.pointerType !== 'touch') return;
		touches = [
			...touches.filter((p) => p.id !== e.pointerId),
			{ id: e.pointerId, x: e.clientX, y: e.clientY }
		];
		if (touches.length === 2) {
			pinchStart = spread();
			zoomAtPinch = settings.zoom;
		}
	}
	function onPointerMove(e: PointerEvent) {
		const p = touches.find((x) => x.id === e.pointerId);
		if (!p) return;
		p.x = e.clientX;
		p.y = e.clientY;
		if (touches.length === 2 && pinchStart > 0)
			settings.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, (zoomAtPinch * spread()) / pinchStart));
	}
	function onPointerEnd(e: PointerEvent) {
		touches = touches.filter((p) => p.id !== e.pointerId);
		pinchStart = 0;
	}

	// Objeto a recolectar elegido en "Personalizar".
	$effect(() => {
		const g = game;
		const skin = COLLECTIBLES[settings.collectible];
		skin.load().then(() => g?.setCollectible(skin));
	});

	export function play(source: PitchSource, latency: number): void {
		game?.start(source, latency);
	}

	export function pause(): void {
		game?.pause();
	}

	export function resume(): void {
		game?.resume();
	}

	export function stop(): void {
		game?.stop();
	}

	const playing = $derived(
		status?.phase === 'listen' ||
			status?.phase === 'countin' ||
			status?.phase === 'playing' ||
			status?.phase === 'paused'
	);
	const pct = $derived(
		status && status.total ? Math.round((status.collected / status.total) * 100) : 0
	);
	const ICONS = { stars: '★', notes: '♪', carrots: '🥕' } as const;
	const icon = $derived(ICONS[settings.collectible]);
</script>

<div
	class="relative h-full w-full overflow-hidden rounded-lg border border-border bg-sky shadow-xl"
>
	<canvas
		bind:this={canvas}
		class="block h-full w-full touch-none"
		onpointerdown={onPointerDown}
		onpointermove={onPointerMove}
		onpointerup={onPointerEnd}
		onpointercancel={onPointerEnd}
	></canvas>

	{#if demo}
		<div class="pointer-events-none absolute inset-x-0 bottom-5 flex justify-center px-3">
			<div
				class="rounded-lg bg-black/40 px-3 py-1.5 text-center text-sm font-semibold text-white backdrop-blur-sm"
			>
				{t('demo.legend')}
			</div>
		</div>
	{/if}

	{#if status}
		<!-- HUD -->
		<div
			class="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3"
		>
			<div class="rounded-lg bg-black/30 px-3 py-2 text-white backdrop-blur-sm">
				<div class="text-xs tracking-wide uppercase opacity-80">{title}</div>
				{#if status.reps}
					<div class="text-sm">
						{t('stage.rep', { i: status.rep + 1, n: status.reps })}
						<b>{noteLabel(sequence.reps[status.rep]?.rootMidi ?? 60)}</b>
					</div>
				{/if}
			</div>
			<div
				class="flex items-center gap-2 rounded-lg bg-black/30 px-3 py-2 text-white backdrop-blur-sm"
			>
				<span class="text-2xl text-star">{icon}</span>
				<span class="text-xl font-bold tabular-nums">{status.collected}</span>
				<span class="text-sm opacity-70">/ {status.total}</span>
			</div>
		</div>

		<!-- Zoom -->
		<div
			class="absolute bottom-4 left-3 flex items-center overflow-hidden rounded-lg bg-black/30 text-white backdrop-blur-sm"
			role="group"
			aria-label={t('zoom.label')}
		>
			<button
				class="grid h-8 w-8 place-items-center text-lg font-bold hover:bg-white/20 disabled:opacity-40"
				aria-label={t('zoom.out')}
				title={t('zoom.out')}
				disabled={settings.zoom <= ZOOM_MIN + 0.01}
				onclick={() => zoomBy(1 / ZOOM_STEP)}>−</button
			>
			<button
				class="h-8 min-w-12 px-1 text-xs font-semibold tabular-nums hover:bg-white/20"
				title={t('zoom.reset')}
				onclick={() => (settings.zoom = 1)}>{Math.round(settings.zoom * 100)}%</button
			>
			<button
				class="grid h-8 w-8 place-items-center text-lg font-bold hover:bg-white/20 disabled:opacity-40"
				aria-label={t('zoom.in')}
				title={t('zoom.in')}
				disabled={settings.zoom >= ZOOM_MAX - 0.01}
				onclick={() => zoomBy(ZOOM_STEP)}>+</button
			>
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
				{status.sungMidi === null ? '—' : noteLabel(status.sungMidi)}
			</div>
		{/if}

		{#if status.phase === 'listen'}
			<div class="pointer-events-none absolute inset-x-0 top-[18%] grid place-items-center">
				<div
					class="flex items-center gap-2 rounded-full bg-black/35 px-5 py-2 text-2xl font-bold text-white backdrop-blur-sm"
				>
					<span class="animate-pulse">♪</span>
					{t('stage.listen')}
				</div>
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
			<div class="absolute inset-0 grid place-items-center bg-black/5">
				{#if sequence.notes.length}
					<button
						class="grid h-20 w-20 place-items-center rounded-full bg-accent text-white shadow-lg transition hover:scale-105"
						aria-label={t('controls.play')}
						title={t('controls.play')}
						onclick={onStart}
					>
						<Icon name="play" class="ml-1 h-9 w-9" />
					</button>
				{:else}
					<div class="max-w-sm rounded-lg bg-black/50 p-4 text-center text-white">
						{t('stage.outOfRange')}
					</div>
				{/if}
			</div>
		{/if}

		{#if status.phase === 'done'}
			<div class="absolute inset-0 grid place-items-center bg-black/35 p-4 backdrop-blur-[2px]">
				<div class="w-full max-w-md rounded-lg bg-surface/95 p-6 text-center shadow-2xl">
					<div class="text-sm text-muted uppercase">{t('stage.done')}</div>
					<div class="my-2 text-5xl font-black">
						<span class="text-star">{icon}</span>
						{status.collected}<span class="text-2xl text-muted">/{status.total}</span>
					</div>
					<div class="mb-4 text-muted">
						{t('stage.percent', {
							p: pct,
							c: t(`collectible.${settings.collectible}`)
						})}
					</div>
					<div class="mb-5 flex h-16 items-end gap-1">
						{#each repScores as r (r.rep)}
							<div
								class="flex-1 rounded-t-lg bg-accent/70"
								style:height="{Math.max(6, (r.collected / r.total) * 100)}%"
								title={t('stage.repTitle', { i: r.rep + 1, c: r.collected, t: r.total })}
							></div>
						{/each}
					</div>
					{#if desync}
						<p
							role="note"
							class="mb-4 flex items-start gap-2 rounded-lg bg-accent/10 p-3 text-left text-sm"
						>
							<span class="text-lg leading-none text-accent" aria-hidden="true">↗</span>
							{t('sync.hint')}
						</p>
					{/if}
					<div class="flex justify-center gap-3">
						<button
							class="flex items-center gap-1.5 rounded-lg bg-surface-2 px-5 py-2 font-semibold hover:bg-border"
							onclick={onStart}
						>
							<Icon name="retry" class="h-4 w-4" />
							{t('stage.retry')}
						</button>
						<button
							class="rounded-lg bg-accent px-5 py-2 font-bold text-white hover:brightness-105"
							onclick={onNext}
						>
							{t('stage.next')} →
						</button>
					</div>
				</div>
			</div>
		{/if}
	{/if}
</div>
