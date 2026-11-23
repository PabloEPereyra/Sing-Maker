<script lang="ts">
	// Entrar con el email (enlace mágico): el campo, el botón y el aviso de que se mandó el enlace. Lo usan el menú
	// de perfil y el indicador de créditos de los creadores («Crea tu cuenta y recibe créditos gratis»).
	import { resolve } from '$app/paths';
	import { requestLink } from '$lib/account.svelte';
	import { t } from '$lib/i18n';

	let email = $state('');
	let sending = $state(false);
	let message = $state('');
	let ok = $state(false);
	let devLink = $state('');

	async function send() {
		if (sending || !email.trim()) return;
		sending = true;
		devLink = '';
		const r = await requestLink(email);
		sending = false;
		ok = r.ok;
		message = r.message;
		devLink = r.devLink ?? '';
	}
</script>

<form
	class="flex gap-1.5"
	onsubmit={(e) => {
		e.preventDefault();
		void send();
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
<p class="text-xs text-muted">
	{t('legal.loginAccept')}
	<a class="underline hover:text-fg" href={resolve('/terms')}>{t('legal.terms')}</a> ·
	<a class="underline hover:text-fg" href={resolve('/privacy')}>{t('legal.privacy')}</a>
</p>
{#if message}
	<p class="text-xs {ok ? 'text-muted' : 'text-red-600'}" role="status">{message}</p>
{/if}
<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- enlace completo de desarrollo -->
{#if devLink}<a class="text-xs font-semibold text-accent underline" href={devLink}
		>{t('account.devLink')}</a
	>{/if}
