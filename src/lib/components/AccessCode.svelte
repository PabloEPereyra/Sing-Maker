<script lang="ts">
	// Lo que lleva gastado esta persona de su cupo con IA y, si el sitio reparte códigos de acceso, el campo
	// para escribir el código. Si hay cuentas, también su sesión: entrar con el email (enlace mágico, con el
	// regalo de créditos de bienvenida), los créditos que le quedan y cerrar sesión. Sin servidor de cupos
	// (desarrollo) no se muestra nada.
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { access, saveAccess } from '$lib/access.svelte';
	import { buyPack, signOut } from '$lib/account.svelte';
	import { t } from '$lib/i18n';
	import { refreshWallet, wallet } from '$lib/wallet.svelte';
	import Icon from './Icon.svelte';
	import LoginForm from './LoginForm.svelte';

	const mode = $derived(wallet.mode);
	const report = $derived(wallet.report);
	const message = $derived(mode === 'locked' && access.code ? t('access.invalid') : '');
	let draft = $state(access.code);

	onMount(() => {
		void refreshWallet();
	});

	function save() {
		saveAccess(draft);
		void refreshWallet();
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
		void refreshWallet();
	}

	const signedIn = $derived(!!report?.auth && !!report.account);
	/** Sin sesión, con cuentas: qué cupos mostrar (solo los que tienen algo). */
	const shown = $derived(
		(['exercises', 'characters'] as const).filter(
			(b) => !report?.auth || (report.limits?.[b] ?? 0) > 0
		)
	);
</script>

{#if mode === 'unknown'}
	<!-- Mientras llega el saldo se reserva el lugar, para que el menú no salte -->
	<div
		class="mb-2 h-36 animate-pulse rounded-lg border border-accent/30 bg-accent/5"
		aria-hidden="true"
	></div>
{:else if mode === 'locked' || mode === 'ok'}
	<div class="menu-row-static mb-2 border border-accent/30 bg-accent/5 !p-3">
		<div class="flex items-center gap-2.5 text-sm font-semibold">
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
			<p class="text-xs text-muted">
				{report.welcome ? t('account.whyWelcome', { n: report.welcome }) : t('account.why')}
			</p>
			<LoginForm />
		{/if}

		{#if report?.used && report.limits}
			<dl class="mt-1.5 space-y-0.5 text-xs text-muted">
				{#if signedIn}
					<div class="flex justify-between">
						<dt>{t('account.credits')}</dt>
						<dd class="font-bold text-fg tabular-nums">{report.account?.credits}</dd>
					</div>
				{/if}
				{#each signedIn ? [] : shown as b (b)}
					<div class="flex justify-between">
						<dt>
							{t(`access.used.${b}`)}{report.auth ? ` · ${t('account.freeNoAccount')}` : ''}
						</dt>
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
