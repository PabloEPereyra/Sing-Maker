<script lang="ts">
	// Calibración del nivel de entrada, al estilo de Voicexplorer (src/lib/mic/micStrip.svelte.ts y
	// MicStrip.svelte): medidor con zonas baja / óptima / saturada, ganancia manual y "Auto", que
	// escucha 3 s de voz y lleva el pico mediano a ~−14 dB.
	import { onDestroy, onMount } from 'svelte';
	import { INPUT_GAIN_MAX, INPUT_GAIN_MIN, type PitchDetector } from '$lib/audio/pitch';
	import { t } from '$lib/i18n';

	let {
		getDetector,
		onClose
	}: { getDetector: () => Promise<PitchDetector | null>; onClose: () => void } = $props();

	const AUTO_SECONDS = 3;
	const TARGET_DB = -14;

	let detector = $state<PitchDetector | null>(null);
	let peakDb = $state(-60);
	let clipping = $state(false);
	let gain = $state(1);
	let autoLeft = $state(0);
	let result = $state('');
	let error = $state('');
	let raf = 0;
	let samples: number[] = [];

	/** Escala visual de Voicexplorer: −60…−18 dB, −18…−6 dB y −6…0 dB ocupan un tercio cada uno. */
	function meterPercent(db: number): number {
		if (db <= -50) return 0;
		if (db >= 0) return 100;
		if (db < -18) return ((db + 60) / 42) * 33.333;
		if (db < -6) return 33.333 + ((db + 18) / 12) * 33.333;
		return 66.666 + ((db + 6) / 6) * 33.334;
	}

	const pct = $derived(meterPercent(peakDb));
	const barColor = $derived(
		clipping || pct >= 66.666 ? '#ef4444' : pct >= 33.333 ? '#22c55e' : '#94a3b8'
	);

	onMount(() => {
		void (async () => {
			detector = await getDetector();
			if (!detector) {
				error = t('mic.error');
				return;
			}
			gain = detector.gain;
			const loop = () => {
				if (!detector) return;
				const lvl = detector.level();
				// Caída suave del medidor para que se pueda leer.
				peakDb = lvl.peakDb > peakDb ? lvl.peakDb : Math.max(lvl.peakDb, peakDb - 1.2);
				clipping = lvl.clipping;
				if (autoLeft > 0) samples.push(lvl.peakDb);
				raf = requestAnimationFrame(loop);
			};
			raf = requestAnimationFrame(loop);
		})();
	});

	onDestroy(() => cancelAnimationFrame(raf));

	function setGain(v: number) {
		gain = v;
		detector?.setGain(v);
	}

	function auto() {
		if (!detector || autoLeft > 0) return;
		result = '';
		samples = [];
		autoLeft = AUTO_SECONDS;
		const timer = setInterval(() => {
			autoLeft -= 1;
			if (autoLeft > 0) return;
			clearInterval(timer);
			// Misma regla que Voicexplorer: saturó → mitad; muy baja → máximo; si no, al objetivo.
			const voiced = samples.filter((db) => db > -35).sort((a, b) => a - b);
			const median = voiced.length ? voiced[voiced.length >> 1] : -60;
			const max = Math.max(-60, ...samples);
			if (max > -1) {
				setGain(Math.max(INPUT_GAIN_MIN, gain * 0.5));
				result = t('mic.resultClip');
			} else if (median < -40) {
				setGain(INPUT_GAIN_MAX);
				result = t('mic.resultQuiet');
			} else {
				const next = gain * Math.pow(10, (TARGET_DB - median) / 20);
				setGain(Math.min(INPUT_GAIN_MAX, Math.max(INPUT_GAIN_MIN, next)));
				result = t('mic.resultDone', { g: gain.toFixed(2) });
			}
		}, 1000);
	}

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
		aria-labelledby="mic-cal-title"
	>
		<div class="flex items-center justify-between">
			<h3 id="mic-cal-title" class="text-lg font-bold">{t('mic.calibrateTitle')}</h3>
			<button
				class="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-surface-2"
				aria-label={t('range.close')}
				onclick={onClose}>✕</button
			>
		</div>
		<p class="mt-1 text-sm text-muted">{t('mic.help')}</p>

		{#if error}
			<p role="alert" class="mt-3 text-sm text-red-600">{error}</p>
		{:else}
			<div class="mt-4 flex justify-between text-[11px] font-semibold text-muted uppercase">
				<span>{t('mic.zoneLow')}</span>
				<span>{t('mic.zoneOptimal')}</span>
				<span>{t('mic.zoneHigh')}</span>
			</div>
			<div class="relative mt-1 h-7 overflow-hidden rounded-lg border border-border bg-surface-2">
				<!-- zonas de fondo -->
				<div class="absolute inset-y-0 left-1/3 w-1/3 bg-green-500/10"></div>
				<div class="absolute inset-y-0 left-2/3 w-1/3 bg-red-500/10"></div>
				<div
					class="absolute inset-y-0 left-0 transition-[width] duration-75"
					style:width="{pct}%"
					style:background={barColor}
				></div>
				<div class="absolute inset-y-0 left-1/3 w-px bg-border"></div>
				<div class="absolute inset-y-0 left-2/3 w-px bg-border"></div>
				<span
					class="absolute inset-y-0 right-2 flex items-center text-xs font-semibold tabular-nums"
				>
					{peakDb > -50 ? `${peakDb.toFixed(0)} dB` : ''}
				</span>
			</div>

			<div class="mt-4 flex items-center gap-3">
				<label class="flex-1">
					<span class="mb-1.5 block text-xs text-muted">{t('mic.gain')} · {gain.toFixed(2)}×</span>
					<input
						type="range"
						min={INPUT_GAIN_MIN}
						max={INPUT_GAIN_MAX}
						step="0.05"
						value={gain}
						oninput={(e) => setGain(Number(e.currentTarget.value))}
						class="vx-slider w-full"
						style:--fill="{((gain - INPUT_GAIN_MIN) / (INPUT_GAIN_MAX - INPUT_GAIN_MIN)) * 100}%"
					/>
				</label>
				<button
					class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
					disabled={!detector || autoLeft > 0}
					onclick={auto}>{t('mic.auto')}</button
				>
			</div>
			{#if autoLeft > 0}
				<p class="mt-3 text-sm font-semibold text-accent">
					{t('mic.autoRunning', { s: autoLeft })}
				</p>
			{:else if result}
				<p class="mt-3 text-sm">{result}</p>
			{/if}
		{/if}
	</div>
</div>
