<script lang="ts">
	// Calibración del retraso de la voz: el micrófono, el piano y la pantalla no están perfectamente
	// sincronizados (más aún con auriculares Bluetooth). Se puede ajustar a mano, o medir: suenan
	// 4 clics de cuenta regresiva y 8 clics más, se canta una sílaba corta ("ta") en cada uno de esos 8 y la mediana de lo que tarda en detectarse
	// la voz respecto del clic queda como corrección. Es el mismo camino que usa el juego.
	import { onDestroy } from 'svelte';
	import { getContext, tick } from '$lib/audio/engine';
	import type { PitchDetector } from '$lib/audio/pitch';
	import { t } from '$lib/i18n';
	import { LATENCY_MAX_MS, LATENCY_MIN_MS, settings } from '$lib/settings.svelte';

	let {
		getDetector,
		onClose
	}: { getDetector: () => Promise<PitchDetector | null>; onClose: () => void } = $props();

	/** Clics de la cuenta regresiva (no se canta) y clics donde se canta "ta". */
	const COUNTDOWN = 4;
	const CLICKS = 8;
	const INTERVAL_SEC = 0.75;
	const LEAD_SEC = 1.2;
	/** Se descarta el primer clic cantado (todavía no se agarró el pulso). */
	const SKIP = 1;
	const MIN_ONSETS = 4;
	const WINDOW_BEFORE_SEC = 0.25;
	const WINDOW_AFTER_SEC = 0.6;

	type Step = 'idle' | 'measuring' | 'done' | 'failed' | 'noMic';
	let step = $state<Step>('idle');
	/** Número de la cuenta regresiva que se ve (4…1); null fuera de ella. */
	let countdown = $state<number | null>(null);
	let raf = 0;

	const median = (xs: number[]) => {
		const s = [...xs].sort((a, b) => a - b);
		return s[s.length >> 1];
	};

	async function measure() {
		if (step === 'measuring') return;
		const detector = await getDetector();
		if (!detector) {
			step = 'noMic';
			return;
		}
		step = 'measuring';
		const ctx = getContext();
		const first = ctx.currentTime + LEAD_SEC;
		const all = Array.from({ length: COUNTDOWN + CLICKS }, (_, i) => first + i * INTERVAL_SEC);
		all.forEach((c, i) => tick(c, i % 4 === 0));
		const clicks = all.slice(COUNTDOWN);
		const end = clicks[CLICKS - 1] + WINDOW_AFTER_SEC;
		const onsets: number[] = [];
		let voiced = false;
		const loop = () => {
			const now = ctx.currentTime;
			const on = detector.read().midi !== null;
			// Durante la cuenta regresiva no se mide nada.
			const sounded = all.slice(0, COUNTDOWN).filter((c) => c <= now).length;
			countdown = sounded < COUNTDOWN ? Math.max(1, COUNTDOWN + 1 - sounded) : null;
			if (on && !voiced && now >= clicks[0] - WINDOW_BEFORE_SEC) onsets.push(now);
			voiced = on;
			if (now < end) {
				raf = requestAnimationFrame(loop);
				return;
			}
			const delays: number[] = [];
			for (const c of clicks.slice(SKIP)) {
				const o = onsets.find((x) => x >= c - WINDOW_BEFORE_SEC && x <= c + WINDOW_AFTER_SEC);
				if (o !== undefined) delays.push(o - c);
			}
			countdown = null;
			if (delays.length < MIN_ONSETS) {
				step = 'failed';
				return;
			}
			// El juego ya descuenta la latencia estimada del detector: se agrega solo lo que falta.
			const total = median(delays) * 1000 - detector.latency * 1000;
			const clamped = Math.max(LATENCY_MIN_MS, Math.min(LATENCY_MAX_MS, total));
			settings.latencyMs = Math.round(clamped / 5) * 5;
			step = 'done';
		};
		raf = requestAnimationFrame(loop);
	}

	onDestroy(() => cancelAnimationFrame(raf));

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	const fill = $derived(
		((settings.latencyMs - LATENCY_MIN_MS) / (LATENCY_MAX_MS - LATENCY_MIN_MS)) * 100
	);
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
		aria-labelledby="sync-title"
	>
		<div class="flex items-center justify-between">
			<h3 id="sync-title" class="text-lg font-bold">{t('sync.title')}</h3>
			<button
				class="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2"
				aria-label={t('range.close')}
				onclick={onClose}>✕</button
			>
		</div>
		<p class="mt-1 text-sm text-muted">{t('sync.help')}</p>

		<div class="mt-4 rounded-lg border border-border bg-base p-3">
			<div class="flex items-center gap-3">
				<button
					class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
					disabled={step === 'measuring'}
					onclick={measure}>{step === 'measuring' ? t('sync.measuring') : t('sync.measure')}</button
				>
				<p class="text-sm text-muted">{t('sync.measureHelp')}</p>
			</div>
			{#if step === 'measuring'}
				<p class="mt-3 text-sm font-semibold text-accent" role="status">
					{countdown !== null ? t('sync.countdown', { n: countdown }) : t('sync.singNow')}
				</p>
			{:else if step === 'done'}
				<p class="mt-3 text-sm" role="status">{t('sync.done', { ms: settings.latencyMs })}</p>
			{:else if step === 'failed'}
				<p class="mt-3 text-sm text-red-600" role="alert">{t('sync.failed')}</p>
			{:else if step === 'noMic'}
				<p class="mt-3 text-sm text-red-600" role="alert">{t('mic.error')}</p>
			{/if}
		</div>

		<label class="mt-4 block">
			<span class="mb-1.5 flex justify-between text-xs text-muted">
				<span>{t('sync.manual')}</span>
				<span class="font-semibold tabular-nums"
					>{settings.latencyMs > 0 ? '+' : ''}{settings.latencyMs} ms</span
				>
			</span>
			<input
				type="range"
				min={LATENCY_MIN_MS}
				max={LATENCY_MAX_MS}
				step="5"
				value={settings.latencyMs}
				oninput={(e) => (settings.latencyMs = Number(e.currentTarget.value))}
				class="vx-slider w-full"
				style:--fill="{fill}%"
			/>
			<span class="mt-1 flex justify-between text-[11px] text-muted">
				<span>{t('sync.earlier')}</span>
				<span>{t('sync.later')}</span>
			</span>
		</label>
		<div class="mt-4 flex justify-end">
			<button
				class="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
				onclick={() => (settings.latencyMs = 0)}>{t('sync.reset')}</button
			>
		</div>
	</div>
</div>
