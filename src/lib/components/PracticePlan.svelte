<script lang="ts">
	// «Tu rutina de hoy»: popup con cuatro pasos según el historial y un objetivo (variada, agudos, afinar, notas
	// largas). Cada paso es una técnica vocal («Haz un trino de labios…») más un ejercicio del nivel de la persona. La rutina del día se guarda: no cambia al terminar un ejercicio ni al recargar, solo
	// al cambiar de objetivo o de día. Tocar un ejercicio lo deja seleccionado en el escenario.
	import { byLevel, shortName, type Exercise } from '$lib/exercises/catalog';
	import { abilityOf } from '$lib/exercises/placement';
	import { loadPassedStages } from '$lib/exercises/placementProgress';
	import { history, setGoal, setRoutine } from '$lib/practice/history.svelte';
	import {
		buildRoutine,
		dayKey,
		doneToday,
		GOALS,
		KINDS,
		lastPercent,
		previousPercent
	} from '$lib/practice/routine';
	import { techniqueById, techniqueText } from '$lib/practice/techniques';
	import { settings } from '$lib/settings.svelte';
	import { t } from '$lib/i18n';
	import Icon from './Icon.svelte';

	interface Props {
		/** Ejercicios que se pueden proponer (los que se ven en la lista). */
		pool: Exercise[];
		onPick: (id: string) => void;
		/** Abre el creador con una descripción ya escrita. */
		onCreate: (prompt: string) => void;
		onClose: () => void;
	}

	let { pool, onPick, onCreate, onClose }: Props = $props();

	const now = Date.now();
	const day = dayKey(now);
	// lo que mostró la prueba de nivel (aunque haya quedado a medias) ajusta la rutina
	const passed = loadPassedStages();
	const ability = passed === null ? null : abilityOf(passed);
	const sig = ability ? `${ability.level}${ability.scales ? 's' : ''}` : '';
	const byId = $derived(new Map(pool.map((e) => [e.id, e])));
	const colors = $derived(new Map(byLevel(pool).map((l) => [l.level, l.color])));

	// Arma la rutina si todavía no hay una para este día y objetivo (o si algún ejercicio ya no existe)
	$effect(() => {
		const saved = history.routine;
		const valid =
			saved &&
			saved.day === day &&
			saved.goal === history.goal &&
			(saved.sig ?? '') === sig &&
			// los pasos tienen que seguir el orden actual (calentar, resonar, abrir, objetivo)
			saved.items.every((i, n) => byId.has(i.id) && techniqueById(i.tech)?.kind === KINDS[n]);
		if (valid) return;
		const items = buildRoutine({
			pool,
			attempts: history.attempts,
			goal: history.goal,
			now,
			ability
		});
		setRoutine({
			day,
			goal: history.goal,
			sig,
			items: items.map((i) => ({ id: i.exercise.id, tech: i.technique.id }))
		});
	});

	const rows = $derived(
		(history.routine?.items ?? []).flatMap((item) => {
			const exercise = byId.get(item.id);
			const technique = techniqueById(item.tech);
			if (!exercise || !technique) return [];
			const last = lastPercent(history.attempts, item.id);
			const before = previousPercent(history.attempts, item.id);
			return [
				{
					exercise,
					kind: technique.kind,
					text: techniqueText(technique, settings.lang),
					color: colors.get(exercise.level) ?? '#64748b',
					done: doneToday(history.attempts, item.id, now),
					last,
					/** Cuánto subió o bajó respecto del intento anterior (si lo hubo). */
					delta: last !== null && before !== null ? last - before : null
				}
			];
		})
	);
	const doneCount = $derived(rows.filter((r) => r.done).length);
	const next = $derived(rows.find((r) => !r.done));

	/** Texto del ejercicio de la rutina con el mismo orden de la lista: «Nivel 2 · Escala mayor». */
	const title = (e: Exercise) => shortName(e, settings.lang);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onClose()} />

<div
	class="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
	role="presentation"
	onclick={(e) => e.target === e.currentTarget && onClose()}
>
	<div
		class="flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden bg-surface text-fg"
		role="dialog"
		aria-modal="true"
		aria-labelledby="routine-title"
	>
		<div class="ribbon flex items-center justify-between px-4 py-2.5">
			<h3 id="routine-title" class="flex items-center gap-2 text-xl leading-tight">
				<Icon name="notebook-pen" class="h-5 w-5" />
				{t('routine.title')}
			</h3>
			<button
				class="grid h-8 w-8 place-items-center rounded-lg text-lg hover:bg-white/20"
				aria-label={t('range.close')}
				onclick={onClose}>✕</button
			>
		</div>

		<div class="min-h-0 flex-1 overflow-y-auto p-4 short:p-3">
			<div class="text-sm text-muted">{t('routine.goal')}</div>
			<div class="mt-1 grid grid-cols-4 gap-1.5 short:gap-1" role="group">
				{#each GOALS as g (g)}
					<button
						class="browser-btn px-1 py-1.5 text-[0.95rem] {history.goal === g
							? '!border-accent-dark !bg-accent !text-white'
							: ''}"
						aria-pressed={history.goal === g}
						onclick={() => setGoal(g)}>{t(`routine.goal.${g}`)}</button
					>
				{/each}
			</div>

			<div class="mt-3 flex items-center gap-2 text-sm text-muted">
				<div class="h-2.5 flex-1 overflow-hidden rounded-full border border-frame bg-surface-2">
					<div
						class="h-full rounded-full bg-accent transition-[width]"
						style:width="{rows.length ? (doneCount / rows.length) * 100 : 0}%"
					></div>
				</div>
				<span class="tabular-nums">
					{t('routine.progress', { done: doneCount, total: rows.length })}
				</span>
			</div>

			<ol class="mt-2 space-y-3">
				{#each rows as r, i (r.exercise.id)}
					<li class={r.done ? 'opacity-70' : ''}>
						<div class="flex flex-wrap items-baseline gap-x-2">
							<span class="font-display text-[1.1rem] leading-tight">{i + 1}. {r.text.name}</span>
							<span class="rounded-full bg-accent/15 px-2 text-xs text-accent-dark"
								>{t(`routine.kind.${r.kind}`)}</span
							>
						</div>
						<p class="mt-0.5 text-sm leading-snug">{r.text.how}</p>
						<button class="ex-card !mt-1.5 !py-2" onclick={() => onPick(r.exercise.id)}>
							<span
								class="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-black/20 font-display text-[1rem] text-[#1b2240]"
								style:background={r.color}
								style:color={r.color === '#000000' || r.color === '#78350f' ? '#fff' : undefined}
							>
								{#if r.done}✓{:else}<Icon name="play" class="h-3.5 w-3.5" />{/if}
							</span>
							<span class="min-w-0 flex-1">
								<span class="block truncate text-[1.05rem] leading-tight">{title(r.exercise)}</span>
								<span class="block text-xs text-muted">
									{t('catalog.level')}
									{r.exercise.level}
								</span>
							</span>
							<span class="shrink-0 text-right text-sm tabular-nums" title={t('routine.last')}>
								{#if r.last === null}
									<span class="rounded-full bg-accent/15 px-2 text-xs text-accent-dark"
										>{t('routine.new')}</span
									>
								{:else}
									{r.last}%
									{#if r.delta}
										<span class={r.delta > 0 ? 'text-green-600' : 'text-red-500'}>
											{r.delta > 0 ? '▲' : '▼'}{Math.abs(r.delta)}
										</span>
									{/if}
								{/if}
							</span>
						</button>
					</li>
				{/each}
			</ol>

			{#if rows.length && !next}
				<p class="mt-3 text-center text-[1.05rem] text-accent-dark">{t('routine.complete')}</p>
			{/if}

			<div class="mt-3 flex flex-col gap-2">
				{#if next}
					<button
						class="rounded-lg bg-accent px-5 py-2 text-[1.05rem] text-white"
						onclick={() => onPick(next.exercise.id)}>{t('routine.start')}</button
					>
				{/if}
				<button
					class="browser-btn flex items-center justify-center gap-1.5 px-3 py-2 text-[1.05rem]"
					onclick={() => onCreate(t(`routine.create.${history.goal}`))}
				>
					<Icon name="wand" class="h-4 w-4" />
					{t('routine.create')}
				</button>
			</div>
		</div>
	</div>
</div>
