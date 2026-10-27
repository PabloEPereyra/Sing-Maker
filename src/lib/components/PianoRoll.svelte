<script lang="ts">
	// Piano roll para revisar y acomodar un patrón: las notas van una detrás de otra (melodía).
	// Arrastrar una nota arriba/abajo cambia el tono; arrastrar su borde derecho, la duración.
	// También con botones y teclado (flechas, Supr), para quien no quiera arrastrar.
	import type { GeneratedNote } from '$lib/music/transcribe';
	import { noteLabel } from '$lib/settings.svelte';
	import { t } from '$lib/i18n';

	let {
		notes = $bindable(),
		beatsPerMeasure = 4,
		root = 60
	}: { notes: GeneratedNote[]; beatsPerMeasure?: number; root?: number } = $props();

	const BEAT = 48; // unidades del viewBox por tiempo
	const ROW = 16; // unidades por semitono
	const LABEL = 40; // columna de nombres de nota
	const GRID = 0.25; // duraciones de a semicorchea
	const HANDLE = 8; // ancho del borde para cambiar la duración

	let selected = $state<number | null>(null);
	let svg: SVGSVGElement;

	const rows = $derived.by(() => {
		const pitched = notes.filter((n) => !n.rest).map((n) => n.s);
		let lo = Math.min(0, ...pitched) - 2;
		let hi = Math.max(0, ...pitched) + 2;
		while (hi - lo < 12) {
			hi++;
			if (hi - lo < 12) lo--;
		}
		return { lo, hi };
	});
	const totalBeats = $derived(notes.reduce((a, n) => a + n.d, 0));
	const width = $derived(LABEL + Math.max(8, Math.ceil(totalBeats) + 1) * BEAT);
	const height = $derived((rows.hi - rows.lo + 1) * ROW);
	const starts = $derived(notes.map((_, i) => notes.slice(0, i).reduce((a, n) => a + n.d, 0)));

	const rowY = (s: number) => (rows.hi - s) * ROW;
	const isBlack = (midi: number) => [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);

	// ---------- arrastre ----------
	let drag: {
		i: number;
		mode: 'pitch' | 'length';
		x: number;
		y: number;
		s: number;
		d: number;
	} | null = null;

	/** Unidades del viewBox por píxel de pantalla. */
	function scale(): number {
		const r = svg.getBoundingClientRect();
		return width / r.width;
	}

	function down(e: PointerEvent, i: number) {
		e.stopPropagation();
		selected = i;
		const n = notes[i];
		const k = scale();
		const r = svg.getBoundingClientRect();
		const x = (e.clientX - r.left) * k;
		const right = LABEL + (starts[i] + n.d) * BEAT;
		drag = {
			i,
			mode: right - x <= HANDLE ? 'length' : 'pitch',
			x: e.clientX,
			y: e.clientY,
			s: n.s,
			d: n.d
		};
		svg.setPointerCapture(e.pointerId);
	}

	function move(e: PointerEvent) {
		if (!drag) return;
		const k = scale();
		const n = notes[drag.i];
		if (drag.mode === 'pitch' && !n.rest) {
			const ds = Math.round((-(e.clientY - drag.y) * k) / ROW);
			setPitch(drag.i, drag.s + ds);
		} else if (drag.mode === 'length') {
			const dd = Math.round(((e.clientX - drag.x) * k) / BEAT / GRID) * GRID;
			setLength(drag.i, drag.d + dd);
		}
	}

	function up() {
		drag = null;
	}

	// ---------- ediciones ----------
	function setPitch(i: number, s: number) {
		notes[i] = { ...notes[i], s: Math.max(-12, Math.min(24, s)) };
	}

	function setLength(i: number, d: number) {
		notes[i] = { ...notes[i], d: Math.max(GRID, Math.min(4, Math.round(d / GRID) * GRID)) };
	}

	function toggleRest(i: number) {
		const n = notes[i];
		notes[i] = n.rest ? { d: n.d, s: notes[i - 1]?.s ?? 0 } : { d: n.d, s: 0, rest: true };
	}

	function duplicate(i: number) {
		notes.splice(i + 1, 0, { ...notes[i] });
		selected = i + 1;
	}

	function remove(i: number) {
		if (notes.length <= 2) return;
		notes.splice(i, 1);
		selected = Math.min(i, notes.length - 1);
	}

	function onKey(e: KeyboardEvent) {
		if (selected === null) return;
		const i = selected;
		const n = notes[i];
		const map: Record<string, () => void> = {
			ArrowUp: () => setPitch(i, n.s + 1),
			ArrowDown: () => setPitch(i, n.s - 1),
			ArrowRight: () => setLength(i, n.d + GRID),
			ArrowLeft: () => setLength(i, n.d - GRID),
			Delete: () => remove(i),
			Backspace: () => remove(i),
			Tab: () => (selected = (i + (e.shiftKey ? notes.length - 1 : 1)) % notes.length)
		};
		const action = map[e.key];
		if (action) {
			e.preventDefault();
			action();
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
	class="rounded-lg border border-border bg-surface outline-none focus-visible:border-accent"
	tabindex="0"
	role="application"
	aria-label={t('roll.label')}
	onkeydown={onKey}
>
	<div class="max-h-72 overflow-auto">
		<svg
			bind:this={svg}
			viewBox="0 0 {width} {height}"
			style:width="{Math.max(100, (width / (14 * BEAT + LABEL)) * 100)}%"
			class="block touch-none select-none"
			role="presentation"
			onpointermove={move}
			onpointerup={up}
			onpointercancel={up}
			onpointerdown={() => (selected = null)}
		>
			<!-- filas: teclas negras sombreadas, nombre de nota a la izquierda -->
			{#each { length: rows.hi - rows.lo + 1 }, r (r)}
				{@const s = rows.hi - r}
				<rect
					x={LABEL}
					y={r * ROW}
					width={width - LABEL}
					height={ROW}
					class={isBlack(root + s) ? 'fill-surface-2' : 'fill-surface'}
				/>
				<text
					x={LABEL - 4}
					y={r * ROW + ROW * 0.72}
					text-anchor="end"
					class="fill-muted text-[9px] {s === 0 ? 'font-bold' : ''}">{noteLabel(root + s)}</text
				>
			{/each}
			<!-- tiempos y compases -->
			{#each { length: Math.floor((width - LABEL) / BEAT) + 1 }, b (b)}
				<line
					x1={LABEL + b * BEAT}
					x2={LABEL + b * BEAT}
					y1="0"
					y2={height}
					class={b % beatsPerMeasure === 0 ? 'stroke-muted/50' : 'stroke-border'}
					stroke-width={b % beatsPerMeasure === 0 ? 1.2 : 0.6}
				/>
			{/each}
			<!-- notas -->
			{#each notes as n, i (i)}
				{@const x = LABEL + starts[i] * BEAT}
				{@const w = n.d * BEAT}
				{#if n.rest}
					<g role="presentation" onpointerdown={(e) => down(e, i)} class="cursor-ew-resize">
						<rect
							x={x + 1}
							y={height / 2 - ROW}
							width={w - 2}
							height={ROW * 2}
							rx="4"
							class="fill-transparent stroke-muted/60 {selected === i ? 'stroke-accent' : ''}"
							stroke-dasharray="4 3"
						/>
						<text
							x={x + w / 2}
							y={height / 2 + 4}
							text-anchor="middle"
							class="fill-muted text-[10px]">{t('roll.rest')}</text
						>
					</g>
				{:else}
					<g role="presentation" onpointerdown={(e) => down(e, i)} class="cursor-ns-resize">
						<rect
							x={x + 1}
							y={rowY(n.s) + 1}
							width={Math.max(4, w - 2)}
							height={ROW - 2}
							rx="4"
							class={n.hint
								? 'fill-muted/30 stroke-muted/60'
								: selected === i
									? 'fill-accent stroke-fg'
									: 'fill-accent/80 stroke-accent'}
							stroke-width={selected === i ? 1.5 : 1}
						/>
						<!-- borde para cambiar la duración -->
						<rect
							x={x + w - HANDLE}
							y={rowY(n.s) + 1}
							width={HANDLE - 1}
							height={ROW - 2}
							class="cursor-ew-resize fill-white/0 hover:fill-white/40"
						/>
					</g>
				{/if}
			{/each}
		</svg>
	</div>

	<!-- acciones sobre la nota elegida -->
	<div class="flex flex-wrap items-center gap-1.5 border-t border-border px-2 py-1.5 text-xs">
		{#if selected !== null && notes[selected]}
			{@const n = notes[selected]}
			<span class="mr-1 font-semibold">
				{n.rest ? t('roll.rest') : noteLabel(root + n.s)} · {n.d}
				{t('roll.beats')}{n.hint ? ` · ${t('roll.hint')}` : ''}
			</span>
			{#if !n.rest}
				<button
					class="roll-btn"
					aria-label={t('roll.up')}
					onclick={() => setPitch(selected!, n.s + 1)}>▲</button
				>
				<button
					class="roll-btn"
					aria-label={t('roll.down')}
					onclick={() => setPitch(selected!, n.s - 1)}>▼</button
				>
			{/if}
			<button
				class="roll-btn"
				aria-label={t('roll.shorter')}
				onclick={() => setLength(selected!, n.d - GRID)}>−</button
			>
			<button
				class="roll-btn"
				aria-label={t('roll.longer')}
				onclick={() => setLength(selected!, n.d + GRID)}>+</button
			>
			<button class="roll-btn" onclick={() => toggleRest(selected!)}
				>{n.rest ? t('roll.toNote') : t('roll.toRest')}</button
			>
			<button class="roll-btn" onclick={() => duplicate(selected!)}>{t('roll.duplicate')}</button>
			<button class="roll-btn text-red-600" onclick={() => remove(selected!)}
				>{t('roll.delete')}</button
			>
		{:else}
			<span class="text-muted">{t('roll.help')}</span>
		{/if}
	</div>
</div>

<style>
	.roll-btn {
		min-width: 1.75rem;
		border-radius: 0.5rem;
		border: 1px solid var(--color-border);
		background: var(--color-surface);
		padding: 0.15rem 0.5rem;
	}
	.roll-btn:hover {
		border-color: var(--color-accent);
	}
</style>
