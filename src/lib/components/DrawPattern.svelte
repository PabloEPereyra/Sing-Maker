<script module lang="ts">
	export interface Block {
		id: number;
		/** Posición horizontal y ancho, en unidades del lienzo (múltiplos de `STEP`). */
		x: number;
		w: number;
		/** Fila: 0 es la más aguda. */
		row: number;
		label: string;
	}
</script>

<script lang="ts">
	// Lienzo para dibujar el patrón con el dedo o el mouse: bloques que se arrastran (más arriba = más agudo, más
	// ancho = más largo) y, si se quiere, el nombre de cada nota. Se convierte en una imagen que lee el mismo
	// modelo que las fotos (Spark, o Wonder al releer); no se calcula ninguna nota acá.
	import { t } from '$lib/i18n';
	import Icon from './Icon.svelte';

	let {
		blocks = $bindable([]),
		onUse,
		onCancel
	}: {
		blocks?: Block[];
		/** Devuelve el dibujo como imagen (data URL PNG). */
		onUse: (image: string) => void;
		onCancel: () => void;
	} = $props();

	const W = 800;
	const H = 400;
	const ROWS = 16;
	const ROW_H = H / ROWS;
	const BLOCK_H = 16;
	const STEP = 10;
	const MIN_W = 20;
	/** Zona del borde derecho de un bloque que lo estira en vez de moverlo. */
	const GRIP = 14;
	const gridLines = Array.from({ length: ROWS - 1 }, (_, i) => (i + 1) * ROW_H);

	let svg = $state<SVGSVGElement>();
	let selected = $state<number | null>(null);
	let nextId = 1;
	for (const b of blocks) nextId = Math.max(nextId, b.id + 1);

	type Drag = {
		mode: 'new' | 'move' | 'resize';
		id: number;
		startX: number;
		startRow: number;
		origX: number;
		origRow: number;
		origW: number;
		moved: boolean;
	};
	let drag: Drag | null = null;

	const sel = $derived(blocks.find((b) => b.id === selected) ?? null);
	const ready = $derived(blocks.length >= 2);

	const snap = (v: number) => Math.round(v / STEP) * STEP;
	const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

	function point(e: PointerEvent): { x: number; y: number } {
		const r = svg!.getBoundingClientRect();
		return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height };
	}
	const rowOf = (y: number) => clamp(Math.floor(y / ROW_H), 0, ROWS - 1);
	const topOf = (row: number) => row * ROW_H + (ROW_H - BLOCK_H) / 2;

	function blockAt(x: number, row: number): Block | undefined {
		return [...blocks].reverse().find((b) => b.row === row && x >= b.x - 4 && x <= b.x + b.w + 4);
	}

	function down(e: PointerEvent) {
		const p = point(e);
		const row = rowOf(p.y);
		const hit = blockAt(p.x, row);
		svg!.setPointerCapture(e.pointerId);
		if (hit) {
			selected = hit.id;
			drag = {
				mode: p.x >= hit.x + hit.w - GRIP ? 'resize' : 'move',
				id: hit.id,
				startX: p.x,
				startRow: row,
				origX: hit.x,
				origRow: hit.row,
				origW: hit.w,
				moved: false
			};
			return;
		}
		const x = clamp(snap(p.x), 0, W - MIN_W);
		const block: Block = { id: nextId++, x, w: MIN_W, row, label: '' };
		blocks = [...blocks, block];
		selected = block.id;
		drag = {
			mode: 'new',
			id: block.id,
			startX: p.x,
			startRow: row,
			origX: x,
			origRow: row,
			origW: MIN_W,
			moved: false
		};
	}

	function move(e: PointerEvent) {
		if (!drag) return;
		const p = point(e);
		const d = drag;
		const block = blocks.find((b) => b.id === d.id);
		if (!block) return;
		const dx = p.x - d.startX;
		if (Math.abs(dx) > 3 || rowOf(p.y) !== d.startRow) d.moved = true;
		if (d.mode === 'move') {
			block.x = clamp(snap(d.origX + dx), 0, W - block.w);
			block.row = clamp(d.origRow + (rowOf(p.y) - d.startRow), 0, ROWS - 1);
		} else {
			block.w = clamp(snap(d.origW + dx), MIN_W, W - block.x);
		}
	}

	function up() {
		const d = drag;
		drag = null;
		if (!d) return;
		const block = blocks.find((b) => b.id === d.id);
		// Un toque sin arrastrar en un lugar vacío no deja un bloque de ancho mínimo.
		if (d.mode === 'new' && block && !d.moved) {
			blocks = blocks.filter((b) => b.id !== d.id);
			selected = null;
		}
	}

	function remove() {
		if (selected === null) return;
		blocks = blocks.filter((b) => b.id !== selected);
		selected = null;
	}

	function clear() {
		blocks = [];
		selected = null;
	}

	function onKey(e: KeyboardEvent) {
		const tag = (e.target as HTMLElement | null)?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA') return;
		if (e.key === 'Delete' || e.key === 'Backspace') {
			e.preventDefault();
			remove();
		}
	}

	/** El dibujo como imagen: trazos oscuros sobre blanco, con el nombre arriba de cada bloque (como en papel). */
	function render(): string {
		const canvas = document.createElement('canvas');
		canvas.width = W;
		canvas.height = H;
		const g = canvas.getContext('2d')!;
		g.fillStyle = '#ffffff';
		g.fillRect(0, 0, W, H);
		g.strokeStyle = '#1f3b24';
		g.fillStyle = '#1f3b24';
		g.lineWidth = 4;
		g.lineJoin = 'round';
		g.font = 'bold 26px sans-serif';
		g.textBaseline = 'alphabetic';
		for (const b of blocks) {
			g.strokeRect(b.x, topOf(b.row), b.w, BLOCK_H);
			if (b.label.trim()) g.fillText(b.label.trim().toUpperCase(), b.x, topOf(b.row) - 8, 200);
		}
		return canvas.toDataURL('image/png');
	}
</script>

<svelte:window onkeydown={onKey} />

<div class="mt-3 rounded-lg border border-border bg-base p-2">
	<p class="px-1 pb-2 text-xs text-muted">{t('draw.help')}</p>
	<svg
		bind:this={svg}
		viewBox="0 0 {W} {H}"
		class="block w-full touch-none rounded-md border border-border bg-surface select-none"
		style="aspect-ratio: {W} / {H}"
		role="img"
		aria-label={t('draw.title')}
		onpointerdown={down}
		onpointermove={move}
		onpointerup={up}
		onpointercancel={up}
	>
		{#each gridLines as y (y)}
			<line x1="0" x2={W} y1={y} y2={y} stroke="var(--color-border)" stroke-width="1" />
		{/each}
		{#each blocks as b (b.id)}
			<rect
				x={b.x}
				y={topOf(b.row)}
				width={b.w}
				height={BLOCK_H}
				rx="3"
				fill={b.id === selected ? 'color-mix(in srgb, var(--color-accent) 25%, white)' : 'white'}
				stroke={b.id === selected ? 'var(--color-accent)' : 'var(--color-fg)'}
				stroke-width="3"
			/>
			<!-- tirador para estirar -->
			<rect
				x={b.x + b.w - 4}
				y={topOf(b.row) + 3}
				width="3"
				height={BLOCK_H - 6}
				rx="1.5"
				fill={b.id === selected ? 'var(--color-accent)' : 'var(--color-border)'}
			/>
			{#if b.label.trim()}
				<text
					x={b.x}
					y={topOf(b.row) - 6}
					font-size="22"
					font-weight="700"
					fill="var(--color-fg)"
					class="pointer-events-none">{b.label.trim().toUpperCase()}</text
				>
			{/if}
		{/each}
	</svg>

	<div class="mt-2 flex flex-wrap items-center gap-2">
		<input
			class="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm outline-none focus:border-accent disabled:opacity-50"
			placeholder={t('draw.label')}
			aria-label={t('draw.label')}
			maxlength="6"
			disabled={!sel}
			value={sel?.label ?? ''}
			oninput={(e) => {
				if (sel) sel.label = e.currentTarget.value;
			}}
		/>
		<button
			class="grid h-9 w-9 place-items-center rounded-lg border border-border bg-surface text-muted hover:text-fg disabled:opacity-40"
			aria-label={t('draw.remove')}
			title={t('draw.remove')}
			disabled={!sel}
			onclick={remove}
		>
			<Icon name="trash" class="h-4 w-4" />
		</button>
		<button
			class="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-2 disabled:opacity-40"
			disabled={!blocks.length}
			onclick={clear}>{t('draw.clear')}</button
		>
	</div>

	<div class="mt-3 flex items-center justify-end gap-2">
		{#if !ready}<span class="mr-auto text-xs text-muted">{t('draw.needTwo')}</span>{/if}
		<button
			class="rounded-lg border border-border bg-surface px-4 py-2 text-sm hover:bg-surface-2"
			onclick={onCancel}>{t('draw.cancel')}</button
		>
		<button
			class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
			disabled={!ready}
			onclick={() => onUse(render())}>{t('draw.use')}</button
		>
	</div>
</div>
