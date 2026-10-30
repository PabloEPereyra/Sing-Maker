<script lang="ts">
	// Código de acceso a las funciones con IA y lo que lleva gastado del cupo. Solo se muestra si el
	// servidor tiene códigos configurados (si no, el acceso es libre y esto no hace falta).
	import { onMount } from 'svelte';
	import { access, saveAccess } from '$lib/access.svelte';
	import type { Bucket } from '$lib/ai/http';
	import { t } from '$lib/i18n';
	import Icon from './Icon.svelte';

	interface Report {
		open: boolean;
		name?: string;
		used?: Record<Bucket, number>;
		limits?: Record<Bucket, number>;
	}

	/** `none`: sin servidor de cupos; `locked`: hay códigos y falta uno válido; `ok`: código válido. */
	let mode = $state<'unknown' | 'none' | 'locked' | 'ok'>('unknown');
	let report = $state<Report | null>(null);
	let message = $state('');
	let draft = $state(access.code);

	async function refresh() {
		message = '';
		report = null;
		try {
			const res = await fetch('/api/quota', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(access.code ? { 'X-Access-Code': access.code } : {})
				},
				body: '{}'
			});
			const data = await res.json().catch(() => null);
			if (res.status === 401) {
				mode = 'locked';
				message = access.code ? t('access.invalid') : '';
			} else if (res.ok && data?.open) mode = 'none';
			else if (res.ok && data?.name) {
				mode = 'ok';
				report = data as Report;
			} else mode = 'none';
		} catch {
			mode = 'none';
		}
	}

	onMount(refresh);

	function save() {
		saveAccess(draft);
		void refresh();
	}
</script>

{#if mode === 'locked' || mode === 'ok'}
	<div class="menu-row-static">
		<div class="flex items-center gap-2.5 text-sm">
			<Icon name="key" class="h-5 w-5 shrink-0 text-accent" />
			{t('access.title')}
			{#if report?.name}<span class="ml-auto truncate text-xs font-bold text-accent"
					>{report.name}</span
				>{/if}
		</div>
		<form
			class="mt-1.5 flex gap-1.5"
			onsubmit={(e) => {
				e.preventDefault();
				save();
			}}
		>
			<input
				type="text"
				bind:value={draft}
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
				placeholder={t('access.placeholder')}
				title={t('access.hint')}
				class="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs outline-none focus:border-accent"
			/>
			<button
				type="submit"
				class="rounded-lg bg-accent px-3 text-xs font-bold text-white hover:brightness-105"
			>
				{t('access.save')}
			</button>
		</form>
		{#if message}<p class="mt-1 text-xs text-red-600">{message}</p>{/if}
		{#if report?.used && report.limits}
			<dl class="mt-1.5 space-y-0.5 text-xs text-muted">
				{#each ['exercises', 'images'] as const as b (b)}
					<div class="flex justify-between">
						<dt>{t(`access.used.${b}`)}</dt>
						<dd class="font-semibold tabular-nums">{report.used[b]} / {report.limits[b]}</dd>
					</div>
				{/each}
			</dl>
		{/if}
	</div>
{/if}
