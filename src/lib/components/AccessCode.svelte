<script lang="ts">
	// Lo que lleva gastado esta persona de su cupo con IA y, si el sitio reparte códigos de acceso, el campo
	// para escribir el código. Si hay cuentas, también su sesión: entrar con el email (enlace mágico), los
	// créditos que le quedan y cerrar sesión. Sin servidor de cupos (desarrollo) no se muestra nada.
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { access, identityHeaders, saveAccess } from '$lib/access.svelte';
	import { buyPack, requestLink, signOut } from '$lib/account.svelte';
	import type { Bucket } from '$lib/ai/http';
	import { t } from '$lib/i18n';
	import Icon from './Icon.svelte';

	interface Report {
		open: boolean;
		codes?: boolean;
		name?: string;
		used?: Record<Bucket, number>;
		limits?: Record<Bucket, number>;
		auth?: boolean;
		account?: { email: string; credits: number } | null;
		packs?: { productId: string; credits: number; price: number }[];
	}

	/** `none`: sin servidor de cupos; `locked`: hay códigos y falta uno válido; `ok`: persona reconocida. */
	let mode = $state<'unknown' | 'none' | 'locked' | 'ok'>('unknown');
	let report = $state<Report | null>(null);
	let message = $state('');
	let draft = $state(access.code);

	// Inicio de sesión
	let email = $state('');
	let sending = $state(false);
	let linkMessage = $state('');
	let linkOk = $state(false);
	let devLink = $state('');

	async function refresh() {
		message = '';
		report = null;
		try {
			const res = await fetch('/api/quota', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', ...identityHeaders() },
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

	async function sendLink() {
		if (sending || !email.trim()) return;
		sending = true;
		devLink = '';
		const r = await requestLink(email);
		sending = false;
		linkOk = r.ok;
		linkMessage = r.message;
		devLink = r.devLink ?? '';
	}

	let buying = $state('');
	let buyMessage = $state('');

	async function buy(productId: string) {
		if (buying) return;
		buying = productId;
		buyMessage = await buyPack(productId);
		if (buyMessage) buying = '';
	}

	async function logout() {
		await signOut();
		linkMessage = '';
		void refresh();
	}

	const signedIn = $derived(!!report?.auth && !!report.account);
</script>

{#if mode === 'locked' || mode === 'ok'}
	<div class="menu-row-static">
		<div class="flex items-center gap-2.5 text-sm">
			<Icon name="key" class="h-5 w-5 shrink-0 text-accent" />
			{report?.auth
				? t('account.title')
				: report?.codes === false
					? t('access.usage')
					: t('access.title')}
			{#if report?.codes && report.name}<span class="ml-auto truncate text-xs font-bold text-accent"
					>{report.name}</span
				>{:else if signedIn}<span class="ml-auto truncate text-xs font-bold text-accent"
					>{report?.account?.email}</span
				>{/if}
		</div>
		<form
			class="mt-1.5 flex gap-1.5 {mode === 'ok' && report?.codes === false ? 'hidden' : ''}"
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

		{#if report?.auth && !report.account}
			<p class="text-xs text-muted">{t('account.why')}</p>
			<p class="text-xs text-muted">
				{t('legal.loginAccept')}
				<a class="underline hover:text-fg" href={resolve('/terms')}>{t('legal.terms')}</a> ·
				<a class="underline hover:text-fg" href={resolve('/privacy')}>{t('legal.privacy')}</a>
			</p>
			<form
				class="flex gap-1.5"
				onsubmit={(e) => {
					e.preventDefault();
					void sendLink();
				}}
			>
				<input
					type="email"
					bind:value={email}
					autocomplete="email"
					autocapitalize="off"
					spellcheck="false"
					required
					placeholder={t('account.emailPlaceholder')}
					class="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-xs outline-none focus:border-accent"
				/>
				<button
					type="submit"
					disabled={sending}
					class="rounded-lg bg-accent px-3 text-xs font-bold text-white hover:brightness-105 disabled:opacity-60"
				>
					{sending ? t('account.sending') : t('account.send')}
				</button>
			</form>
			{#if linkMessage}
				<p class="text-xs {linkOk ? 'text-muted' : 'text-red-600'}" role="status">{linkMessage}</p>
			{/if}
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- enlace completo de desarrollo -->
			{#if devLink}<a class="text-xs font-semibold text-accent underline" href={devLink}
					>{t('account.devLink')}</a
				>{/if}
		{/if}

		{#if report?.used && report.limits}
			<dl class="mt-1.5 space-y-0.5 text-xs text-muted">
				{#if signedIn}
					<div class="flex justify-between">
						<dt>{t('account.credits')}</dt>
						<dd class="font-bold text-fg tabular-nums">{report.account?.credits}</dd>
					</div>
				{/if}
				{#each ['exercises', 'characters'] as const as b (b)}
					<div class="flex justify-between">
						<dt>{t(`access.used.${b}`)}{report.auth ? ` · ${t('account.free')}` : ''}</dt>
						<dd class="font-semibold tabular-nums">
							{Math.min(report.used[b], report.limits[b])} / {report.limits[b]}
						</dd>
					</div>
				{/each}
			</dl>
		{/if}
		{#if signedIn && report?.packs?.length}
			<div class="mt-1 text-xs font-semibold">{t('account.buy')}</div>
			<div class="flex flex-wrap gap-1.5">
				{#each report.packs as pack (pack.productId)}
					<button
						class="rounded-lg border border-accent/40 bg-surface-2 px-2.5 py-1.5 text-xs font-bold text-accent hover:border-accent disabled:opacity-60"
						disabled={!!buying}
						onclick={() => buy(pack.productId)}
						>{t('account.pack', { credits: pack.credits, price: pack.price })}</button
					>
				{/each}
			</div>
			<p class="text-xs text-muted">
				{t('legal.buyAccept')}
				<a class="underline hover:text-fg" href={resolve('/terms')}>{t('legal.terms')}</a> ·
				<a class="underline hover:text-fg" href={resolve('/pricing')}>{t('legal.pricing')}</a>
			</p>
			{#if buyMessage}<p class="text-xs text-red-600" role="status">{buyMessage}</p>{/if}
		{/if}
		{#if signedIn}
			<button
				class="self-start text-xs font-semibold text-muted underline hover:text-fg"
				onclick={logout}>{t('account.logout')}</button
			>
		{/if}
	</div>
{/if}
