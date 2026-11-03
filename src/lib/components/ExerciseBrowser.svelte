<script lang="ts">
	// Visor de ejercicios: una cuadrícula de niveles (y «Mis ejercicios») y, al tocar uno, una tarjeta con la
	// vista previa del patrón. Las flechas de los costados recorren los ejercicios del nivel (del último vuelve
	// al primero y al revés); los botones de abajo rotan entre niveles: 1 → 2 → 3 → Mis ejercicios → 1.
	import { onDestroy } from 'svelte';
	import { exerciseText, type Exercise, type LevelGroup } from '$lib/exercises/catalog';
	import { firstRoot, playPattern, stopPreview } from '$lib/audio/preview';
	import { settings } from '$lib/settings.svelte';
	import { t } from '$lib/i18n';
	import Icon from './Icon.svelte';
	import PatternPreview from './PatternPreview.svelte';

	/** Tempo con el que se escucha el patrón, el mismo con que arranca cada ejercicio. */
	const PREVIEW_BPM = 90;

	interface Props {
		/** Niveles del catálogo (con los de la biblioteca ya desbloqueados). */
		levels: LevelGroup[];
		/** Ejercicios propios (creados con IA). */
		mine: Exercise[];
		selectedId: string;
		/** Rango de voz: el patrón se escucha centrado en él. */
		low: number;
		high: number;
		onPick: (id: string) => void;
		onDelete: (id: string) => void;
		onClose: () => void;
	}

	let { levels, mine, selectedId, low, high, onPick, onDelete, onClose }: Props = $props();

	interface Group {
		key: string;
		label: string;
		/** Nombre del nivel (vacío en «Mis ejercicios»). */
		color: string;
		fg: string;
		exercises: Exercise[];
		isMine: boolean;
	}

	/** Texto legible sobre el color de cinturón del nivel (blanco, amarillo… o negro). */
	function ink(hex: string): string {
		const n = parseInt(hex.slice(1), 16);
		const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
		return lum > 0.6 ? '#1b2240' : '#fff';
	}

	/** Oscurece un color (`k` < 1) para la cinta y el pie de la tarjeta. */
	function shade(hex: string, k: number): string {
		const n = parseInt(hex.slice(1), 16);
		const c = (v: number) =>
			Math.round(v * k)
				.toString(16)
				.padStart(2, '0');
		return `#${c(n >> 16)}${c((n >> 8) & 255)}${c(n & 255)}`;
	}

	/**
	 * Cuánto se oscurece el pie de la tarjeta (factor de `shade`): el ámbar se vuelve marrón si se oscurece
	 * como los demás, así que se aclara; el naranja rojizo (nivel 3) se oscurece más para contrastar con el
	 * texto blanco.
	 */
	function depth(hex: string): number {
		const n = parseInt(hex.slice(1), 16);
		const [r, g, b] = [n >> 16, (n >> 8) & 255, n & 255];
		const max = Math.max(r, g, b);
		const d = max - Math.min(r, g, b);
		if (!d) return 0.78;
		const h =
			max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
		const hue = h * 60;
		if (hue >= 40 && hue < 60) return 0.92;
		if ((hue < 40 || hue >= 340) && max > 200) return 0.66;
		return 0.78;
	}

	/** El orden de la rotación: niveles de menor a mayor y, al final, los propios (si hay). */
	const groups = $derived<Group[]>([
		...levels.map((lv) => ({
			key: lv.level,
			label: `${t('catalog.level')} ${lv.level}`,
			color: lv.color,
			fg: ink(lv.color),
			exercises: lv.exercises,
			isMine: false
		})),
		...(mine.length
			? [
					{
						key: 'mine',
						label: t('create.mine'),
						color: '#8b5cf6',
						fg: '#fff',
						exercises: mine,
						isMine: true
					}
				]
			: [])
	]);

	let view = $state<'grid' | 'card'>('grid');
	let groupIdx = $state(0);
	let exIdx = $state(0);
	let listening = $state(false);

	const group = $derived(groups[Math.min(groupIdx, groups.length - 1)]);
	const exercise = $derived(group?.exercises[Math.min(exIdx, (group?.exercises.length ?? 1) - 1)]);
	const currentGroup = $derived(
		groups.findIndex((g) => g.exercises.some((e) => e.id === selectedId))
	);

	function openGroup(i: number) {
		stop();
		groupIdx = i;
		const at = groups[i].exercises.findIndex((e) => e.id === selectedId);
		exIdx = at === -1 ? 0 : at;
		view = 'card';
	}

	function stepExercise(d: number) {
		stop();
		const n = group.exercises.length;
		exIdx = (exIdx + d + n) % n;
	}

	function stepLevel(d: number) {
		stop();
		groupIdx = (groupIdx + d + groups.length) % groups.length;
		exIdx = 0;
	}

	function backToGrid() {
		stop();
		view = 'grid';
	}

	function stop() {
		stopPreview();
		listening = false;
	}

	async function listen() {
		if (!exercise) return;
		if (listening) return stop();
		const { notes, meta } = exercise.parsed;
		listening = true;
		await playPattern(notes, PREVIEW_BPM, firstRoot(notes, low, high, meta.direction));
		listening = false;
	}

	function remove() {
		if (!exercise) return;
		stop();
		// Con el último ejercicio propio desaparece el grupo: de vuelta a la cuadrícula.
		const last = group.isMine && group.exercises.length <= 1;
		onDelete(exercise.id);
		if (last) view = 'grid';
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
		else if (view === 'card' && e.key === 'ArrowLeft') stepExercise(-1);
		else if (view === 'card' && e.key === 'ArrowRight') stepExercise(1);
	}

	onDestroy(stop);

	const prevGroup = $derived(groups[(groupIdx - 1 + groups.length) % groups.length]);
	const nextGroup = $derived(groups[(groupIdx + 1) % groups.length]);
	const previewNotes = $derived(
		exercise?.parsed.notes.map((n) => ({
			d: n.duration,
			s: n.semitones,
			rest: n.isRest,
			hint: n.isHint
		})) ?? []
	);
</script>

<svelte:window onkeydown={onKey} />

<div
	class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
	role="presentation"
	onclick={(e) => e.target === e.currentTarget && onClose()}
>
	<!-- La cuadrícula y la tarjeta comparten la misma forma vertical 3:4 (en pantallas anchas); en las bajas, como un celular acostado, son anchas -->
	<div
		class="flex max-h-[92vh] w-full max-w-md flex-col overflow-y-auto md:aspect-[3/4] md:w-[min(28rem,69vh)] short:aspect-auto short:w-[min(40rem,94vw)] short:max-w-none {view ===
		'card'
			? ''
			: 'bg-surface text-fg'}"
		style:background={view === 'card' && group
			? `linear-gradient(180deg, ${group.color}, ${shade(group.color, depth(group.color))})`
			: undefined}
		style:color={view === 'card' && group ? group.fg : undefined}
		role="dialog"
		aria-modal="true"
		aria-labelledby="browser-title"
	>
		{#if view === 'grid' || !group || !exercise}
			<div class="ribbon flex items-center justify-between px-4 py-2.5">
				<h3 id="browser-title" class="text-xl leading-tight">{t('menu.exercises')}</h3>
				<button
					class="grid h-8 w-8 place-items-center rounded-lg text-lg hover:bg-white/20"
					aria-label={t('range.close')}
					onclick={onClose}>✕</button
				>
			</div>
			<!-- Dos niveles arriba y dos abajo; «Mis ejercicios» siempre ocupa su lugar para mantener la simetría -->
			<div
				class="grid flex-1 auto-rows-fr grid-cols-2 gap-3 p-4 short:grid-cols-4 short:gap-2 short:p-3"
			>
				{#each groups as g, i (g.key)}
					<button
						class="level-tile {i === currentGroup ? 'level-tile-on' : ''}"
						style:--tile={g.color}
						style:--tile-fg={g.fg}
						aria-label={g.label}
						onclick={() => openGroup(i)}
					>
						{#if g.isMine}<Icon name="sparkles" class="h-12 w-12 short:h-9 short:w-9" />{:else}<span class="text-5xl leading-none short:text-4xl">{g.key}</span>{/if}
						{#if g.isMine}
							<span class="max-w-full truncate px-1 text-[1.05rem]">{g.label}</span>
						{/if}
						<span class="rounded-full bg-black/15 px-2.5 text-sm">
							{g.exercises.length}
						</span>
					</button>
				{/each}
				{#if !mine.length}
					<button
						class="level-tile"
						style:--tile="#8b5cf6"
						style:--tile-fg="#fff"
						disabled
						aria-label={t('create.mine')}
					>
						<Icon name="sparkles" class="h-12 w-12 short:h-9 short:w-9" />
						<span class="max-w-full truncate px-1 text-[1.05rem]">{t('create.mine')}</span>
						<span class="rounded-full bg-black/15 px-2.5 text-sm">0</span>
					</button>
				{/if}
			</div>
		{:else}
			<div
				class="ribbon flex items-center gap-2 px-3 py-2.5"
				style:--ribbon={shade(group.color, depth(group.color) + 0.02)}
				style:--ribbon-fg={ink(shade(group.color, depth(group.color) + 0.02))}
			>
				<button
					class="grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-white/20"
					aria-label={t('menu.exercises')}
					title={t('menu.exercises')}
					onclick={backToGrid}
				>
					<Icon name="back" class="h-5 w-5" />
				</button>
				<h3 id="browser-title" class="min-w-0 flex-1 truncate text-xl leading-tight">
					{#if group.isMine}<Icon name="sparkles" class="mr-1 inline h-5 w-5 align-text-bottom" />{/if}{group.label}
				</h3>
				<button
					class="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-lg hover:bg-white/20"
					aria-label={t('range.close')}
					onclick={onClose}>✕</button
				>
			</div>

			<div class="flex min-h-0 flex-1 flex-col p-4 short:flex-row short:gap-3 short:p-3">
				<div class="flex min-h-0 flex-1 flex-col">
					<div class="text-center text-[1.05rem] tabular-nums opacity-80">
						{exIdx + 1} / {group.exercises.length}
					</div>
					<!-- Vista previa a todo el ancho; las flechas van dentro, con borde pero discretas -->
					<div
						class="relative mt-1 h-44 overflow-hidden rounded-lg border-2 border-frame bg-base text-fg md:h-auto md:min-h-32 md:flex-1 short:h-auto short:min-h-24 short:flex-1"
					>
						<PatternPreview notes={previewNotes} class="h-full w-full px-10 py-3" />
						<button
							class="absolute top-1/2 left-1.5 grid h-14 w-7 -translate-y-1/2 place-items-center rounded-lg border-2 border-frame bg-surface/70 text-muted transition hover:border-accent hover:text-accent"
							aria-label={t('browser.prev')}
							title={t('browser.prev')}
							onclick={() => stepExercise(-1)}
						>
							<Icon name="back" class="h-4 w-4" />
						</button>
						<button
							class="absolute top-1/2 right-1.5 grid h-14 w-7 -translate-y-1/2 place-items-center rounded-lg border-2 border-frame bg-surface/70 text-muted transition hover:border-accent hover:text-accent"
							aria-label={t('browser.next')}
							title={t('browser.next')}
							onclick={() => stepExercise(1)}
						>
							<Icon name="back" class="h-4 w-4 rotate-180" />
						</button>
					</div>
				</div>
				<div class="flex min-h-0 flex-col short:w-[46%] short:justify-center">
					<h4 class="mt-3 text-center text-2xl leading-tight short:mt-0">
						{exerciseText(exercise, settings.lang).name}
					</h4>
					<p class="mt-1.5 line-clamp-3 text-center text-[1.05rem] opacity-85">
						{exerciseText(exercise, settings.lang).description}
					</p>

					<div class="mt-4 flex items-stretch justify-center gap-2 short:mt-2">
						<button
							class="browser-btn inline-flex items-center gap-1.5 px-4 py-2 text-[1.05rem] {listening
								? 'border-accent text-accent'
								: ''}"
							onclick={listen}
							> {#if listening}<Icon name="stop" class="h-4 w-4" />{:else}<Icon name="play" class="h-4 w-4" />{/if}
							{listening ? t('create.stopListen') : t('create.listen')}</button
						>
						<button
							class="flex-1 rounded-lg bg-accent px-5 py-2 text-[1.05rem] text-white"
							onclick={() => onPick(exercise.id)}>{t('create.practice')}</button
						>
						{#if group.isMine}
							<button
								class="trash-btn"
								aria-label={t('create.delete')}
								title={t('create.delete')}
								onclick={remove}
							>
								<Icon name="trash" class="h-4 w-4" />
							</button>
						{/if}
					</div>

					<!-- Rotación de niveles: 1 → 2 → 3 → Mis ejercicios → 1 -->
					{#if groups.length > 1}
						<div class="mt-3 grid grid-cols-2 gap-2 short:mt-2">
							<button
								class="browser-btn flex items-center justify-center gap-1.5 px-2 py-2 text-[1.05rem]"
								aria-label={t('browser.levelPrev')}
								onclick={() => stepLevel(-1)}
							>
								<span aria-hidden="true">‹</span>
								<span class="truncate">{prevGroup.label}</span>
							</button>
							<button
								class="browser-btn flex items-center justify-center gap-1.5 px-2 py-2 text-[1.05rem]"
								aria-label={t('browser.levelNext')}
								onclick={() => stepLevel(1)}
							>
								<span class="truncate">{nextGroup.label}</span>
								<span aria-hidden="true">›</span>
							</button>
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>
