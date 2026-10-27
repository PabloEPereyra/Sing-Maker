<script lang="ts">
	// Piano roll para revisar y acomodar un patrón. Clic en un espacio vacío agrega una nota; arrastrar
	// el centro de una nota la mueve (arriba/abajo cambia el tono, a los costados el momento); arrastrar
	// el borde izquierdo o derecho cambia su duración; clic derecho la borra. Las notas nunca se
	// superponen: al poner una, las demás le hacen lugar (ver music/roll.ts). También hay botones y
	// teclado (flechas, Supr) para quien no quiera arrastrar.
	import type { GeneratedNote } from '$lib/music/transcribe';
	import {
		clampDuration,
		fromEvents,
		GRID,
		MAX_DURATION,
		place,
		snap,
		toEvents,
		totalOf,
		type RollEvent
	} from '$lib/music/roll';
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
	const HANDLE = 8; // ancho máximo de cada borde para cambiar la duración
	const PAD = 4; // semitonos de aire arriba y abajo
	const TAIL = 4; // tiempos de aire a la derecha
	const MIN_PITCH = -12;
	const MAX_PITCH = 24;
	/** Largo de la nota que se agrega con un clic (se recuerda el de la última editada). */
	let newLength = $state(1);

	let selected = $state<number | null>(null);
	let svg: SVGSVGElement;

	type Mode = 'move' | 'left' | 'right';
	interface Drag {
		mode: Mode;
		/** Las demás notas y la elegida, como estaban al empezar (cada movimiento parte de ahí). */
		others: RollEvent[];
		origin: RollEvent;
		total: number;
		x: number;
		y: number;
		/** Límite del borde izquierdo: no pasa de la nota anterior. */
		minStart: number;
		/** Medidas fijas durante el arrastre, para que la hoja no se mueva bajo el puntero. */
		lo: number;
		hi: number;
		beats: number;
	}
	let drag = $state.raw<Drag | null>(null);

	const view = $derived.by(() => {
		if (drag) return { lo: drag.lo, hi: drag.hi, beats: drag.beats };
		const pitched = notes.filter((n) => !n.rest).map((n) => n.s);
		let lo = Math.min(0, ...pitched) - PAD;
		let hi = Math.max(0, ...pitched) + PAD;
		while (hi - lo < 12) {
			hi++;
			if (hi - lo < 12) lo--;
		}
		return { lo, hi, beats: Math.max(8, Math.ceil(totalOf(notes)) + TAIL) };
	});
	const width = $derived(LABEL + view.beats * BEAT);
	const height = $derived((view.hi - view.lo + 1) * ROW);
	const starts = $derived(notes.map((_, i) => notes.slice(0, i).reduce((a, n) => a + n.d, 0)));

	const rowY = (s: number) => (view.hi - s) * ROW;
	const isBlack = (midi: number) => [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
	/** Un compás en tiempos (6/8 = 3 negras). */
	const measure = $derived(beatsPerMeasure === 6 ? 3 : beatsPerMeasure);

	/** Unidades del viewBox por píxel de pantalla. */
	function scale(): number {
		return width / svg.getBoundingClientRect().width;
	}

	// ---------- ediciones (todas pasan por `commit`) ----------
	function commit(others: RollEvent[], active: RollEvent, total: number) {
		const r = place(others, active, total);
		const out = fromEvents(r.events, r.total, active);
		notes = out.notes;
		selected = out.index;
	}

	/** Eventos de la lista actual, con la nota `i` aparte. */
	function split(i: number) {
		const { events, total } = toEvents(notes);
		const active = events.find((e) => e.from === i);
		return active ? { others: events.filter((e) => e !== active), active, total } : null;
	}

	function edit(i: number, change: (e: RollEvent) => RollEvent) {
		const sp = split(i);
		if (!sp) return;
		const e = change({ ...sp.active });
		newLength = e.d;
		commit(sp.others, e, sp.total);
	}

	const setPitch = (i: number, s: number) =>
		edit(i, (e) => ({
			...e,
			note: { ...e.note, s: Math.max(MIN_PITCH, Math.min(MAX_PITCH, s)) }
		}));
	const setLength = (i: number, d: number) => edit(i, (e) => ({ ...e, d: clampDuration(d) }));
	const shift = (i: number, beats: number) =>
		edit(i, (e) => ({ ...e, start: Math.max(0, snap(e.start + beats)) }));

	function duplicate(i: number) {
		const sp = split(i);
		if (!sp) return;
		const copy = {
			...sp.active,
			start: sp.active.start + sp.active.d,
			note: { ...sp.active.note }
		};
		commit([...sp.others, sp.active], copy, sp.total);
	}

	/** Borra la nota y deja su lugar como silencio (las demás no se mueven). */
	function remove(i: number) {
		const sp = split(i);
		if (!sp || sp.others.length < 2) return;
		notes = fromEvents(sp.others, sp.total).notes;
		selected = null;
	}

	function addAt(e: PointerEvent) {
		if (e.button !== 0) return;
		const r = svg.getBoundingClientRect();
		const k = width / r.width;
		const x = (e.clientX - r.left) * k;
		const y = (e.clientY - r.top) * k;
		if (x < LABEL) {
			selected = null;
			return;
		}
		const start = Math.floor((x - LABEL) / BEAT / GRID) * GRID;
		const s = Math.max(MIN_PITCH, Math.min(MAX_PITCH, view.hi - Math.floor(y / ROW)));
		const { events, total } = toEvents(notes);
		commit(events, { start, d: newLength, note: { d: newLength, s }, from: -1 }, total);
	}

	// ---------- arrastre ----------
	function down(e: PointerEvent, i: number, mode: Mode) {
		if (e.button !== 0) return;
		e.stopPropagation();
		selected = i;
		const sp = split(i);
		if (!sp) return;
		const prev = sp.others.filter((o) => o.start < sp.active.start).at(-1);
		drag = {
			mode,
			others: sp.others,
			origin: sp.active,
			total: sp.total,
			x: e.clientX,
			y: e.clientY,
			minStart: prev ? prev.start + GRID : 0,
			lo: view.lo,
			hi: view.hi,
			beats: view.beats
		};
		svg.setPointerCapture(e.pointerId);
	}

	function move(e: PointerEvent) {
		if (!drag) return;
		const k = scale();
		const dBeats = ((e.clientX - drag.x) * k) / BEAT;
		const o = drag.origin;
		const end = o.start + o.d;
		let active: RollEvent;
		if (drag.mode === 'move') {
			const ds = Math.round((-(e.clientY - drag.y) * k) / ROW);
			const s = Math.max(Math.max(MIN_PITCH, drag.lo), Math.min(MAX_PITCH, drag.hi, o.note.s + ds));
			const start = Math.max(0, Math.min(drag.beats - o.d, snap(o.start + dBeats)));
			active = { ...o, start, note: { ...o.note, s } };
		} else if (drag.mode === 'right') {
			active = { ...o, d: Math.min(clampDuration(o.d + dBeats), drag.beats - o.start) };
		} else {
			const start = Math.max(
				drag.minStart,
				end - MAX_DURATION,
				Math.min(end - GRID, snap(o.start + dBeats))
			);
			active = { ...o, start, d: end - start };
		}
		newLength = active.d;
		commit(drag.others, active, drag.total);
	}

	function up() {
		drag = null;
	}

	function onKey(e: KeyboardEvent) {
		if (selected === null) return;
		const i = selected;
		const n = notes[i];
		if (!n || n.rest) return;
		const horizontal = (dir: 1 | -1) =>
			e.shiftKey ? setLength(i, n.d + dir * GRID) : shift(i, dir * GRID);
		const map: Record<string, () => void> = {
			ArrowUp: () => setPitch(i, n.s + 1),
			ArrowDown: () => setPitch(i, n.s - 1),
			ArrowRight: () => horizontal(1),
			ArrowLeft: () => horizontal(-1),
			Delete: () => remove(i),
			Backspace: () => remove(i),
			Tab: () => {
				const idx = notes.map((x, j) => (x.rest ? -1 : j)).filter((j) => j >= 0);
				const at = idx.indexOf(i);
				selected = idx[(at + (e.shiftKey ? idx.length - 1 : 1)) % idx.length];
			}
		};
		const action = map[e.key];
		if (action) {
			e.preventDefault();
			action();
		}
	}

	const CURSOR: Record<Mode, string> = { move: 'grabbing', left: 'ew-resize', right: 'ew-resize' };
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
			style:--drag-cursor={drag ? CURSOR[drag.mode] : null}
			class="block cursor-cell touch-none select-none"
			class:dragging={drag}
			role="presentation"
			onpointermove={move}
			onpointerup={up}
			onpointercancel={up}
			onpointerdown={addAt}
			oncontextmenu={(e) => e.preventDefault()}
		>
			<!-- filas: teclas negras sombreadas, nombre de nota a la izquierda -->
			{#each { length: view.hi - view.lo + 1 }, r (r)}
				{@const s = view.hi - r}
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
					class="pointer-events-none fill-muted text-[9px] {s === 0 ? 'font-bold' : ''}"
					>{noteLabel(root + s)}</text
				>
			{/each}
			<!-- tiempos y compases -->
			{#each { length: view.beats + 1 }, b (b)}
				<line
					x1={LABEL + b * BEAT}
					x2={LABEL + b * BEAT}
					y1="0"
					y2={height}
					class="pointer-events-none {b % measure === 0 ? 'stroke-muted/50' : 'stroke-border'}"
					stroke-width={b % measure === 0 ? 1.2 : 0.6}
				/>
			{/each}
			<!-- silencios: huecos entre notas (un clic ahí agrega una nota) -->
			{#each notes as n, i (i)}
				{#if n.rest}
					<rect
						x={LABEL + starts[i] * BEAT + 1}
						y={height / 2 - 2}
						width={Math.max(2, n.d * BEAT - 2)}
						height="4"
						rx="2"
						class="pointer-events-none fill-muted/25"
					/>
				{/if}
			{/each}
			<!-- notas: centro para mover, bordes para cambiar la duración -->
			{#each notes as n, i (i)}
				{#if !n.rest}
					{@const x = LABEL + starts[i] * BEAT}
					{@const w = n.d * BEAT}
					{@const edge = Math.min(HANDLE, w / 3)}
					<g role="presentation" oncontextmenu={(e) => (e.preventDefault(), remove(i))}>
						<rect
							x={x + 1}
							y={rowY(n.s) + 1}
							width={Math.max(4, w - 2)}
							height={ROW - 2}
							rx="4"
							class="pointer-events-none {n.hint
								? 'fill-muted/30 stroke-muted/60'
								: selected === i
									? 'fill-accent stroke-fg'
									: 'fill-accent/80 stroke-accent'}"
							stroke-width={selected === i ? 1.5 : 1}
						/>
						<rect
							x={x + edge}
							y={rowY(n.s)}
							width={Math.max(1, w - edge * 2)}
							height={ROW}
							class="cursor-grab fill-transparent"
							role="presentation"
							onpointerdown={(e) => down(e, i, 'move')}
						/>
						<rect
							{x}
							y={rowY(n.s)}
							width={edge}
							height={ROW}
							class="cursor-ew-resize fill-white/0 hover:fill-white/40"
							role="presentation"
							onpointerdown={(e) => down(e, i, 'left')}
						/>
						<rect
							x={x + w - edge}
							y={rowY(n.s)}
							width={edge}
							height={ROW}
							class="cursor-ew-resize fill-white/0 hover:fill-white/40"
							role="presentation"
							onpointerdown={(e) => down(e, i, 'right')}
						/>
					</g>
				{/if}
			{/each}
		</svg>
	</div>

	<!-- acciones sobre la nota elegida -->
	<div class="flex flex-wrap items-center gap-1.5 border-t border-border px-2 py-1.5 text-xs">
		{#if selected !== null && notes[selected] && !notes[selected].rest}
			{@const n = notes[selected]}
			<span class="mr-1 font-semibold">
				{noteLabel(root + n.s)} · {n.d}
				{t('roll.beats')}{n.hint ? ` · ${t('roll.hint')}` : ''}
			</span>
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
	/* Mientras se arrastra, el cursor es el del gesto aunque el puntero pase sobre otra cosa. */
	.dragging,
	.dragging :global(*) {
		cursor: var(--drag-cursor) !important;
	}
</style>
