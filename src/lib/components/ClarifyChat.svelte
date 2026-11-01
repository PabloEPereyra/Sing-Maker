<script lang="ts">
	// Cuando la IA necesita más detalles para crear un personaje, objeto o fondo, la pregunta aparece como un
	// mensaje de chat con su propio espacio para responder (la descripción original no se toca).
	import type { BriefTurn } from '$lib/ai/character';
	import { t } from '$lib/i18n';
	import Icon from './Icon.svelte';

	let {
		thread,
		question,
		busy = false,
		onReply
	}: {
		/** Preguntas ya respondidas, en orden. */
		thread: BriefTurn[];
		/** La pregunta que espera respuesta. */
		question: string;
		busy?: boolean;
		onReply: (text: string) => void;
	} = $props();

	let reply = $state('');
	let input = $state<HTMLInputElement>();

	// Al llegar una pregunta nueva el cursor va directo al espacio de respuesta.
	$effect(() => {
		if (question) input?.focus();
	});

	const canSend = $derived(reply.trim().length > 0 && !busy);

	function send() {
		if (!canSend) return;
		const text = reply.trim();
		reply = '';
		onReply(text);
	}
</script>

<div
	class="mt-3 rounded-lg border border-accent/40 bg-accent/10 p-3"
	role="group"
	aria-label={t('chat.title')}
>
	<ul class="flex flex-col gap-2 text-sm">
		{#each thread as turn, i (i)}
			<li class="max-w-[90%] self-start rounded-lg rounded-bl-sm bg-surface px-3 py-2">{turn.q}</li>
			<li class="max-w-[90%] self-end rounded-lg rounded-br-sm bg-accent px-3 py-2 text-white">
				{turn.a}
			</li>
		{/each}
		<li class="max-w-[90%] self-start rounded-lg rounded-bl-sm bg-surface px-3 py-2" role="alert">
			{question}
		</li>
	</ul>
	<form
		class="mt-3 flex items-center gap-2"
		onsubmit={(e) => {
			e.preventDefault();
			send();
		}}
	>
		<input
			bind:this={input}
			bind:value={reply}
			maxlength="300"
			disabled={busy}
			placeholder={t('chat.placeholder')}
			aria-label={t('chat.placeholder')}
			class="min-w-0 flex-1 rounded-lg border border-border bg-base px-3 py-2 text-sm outline-none focus:border-accent disabled:opacity-60"
		/>
		<button
			type="submit"
			class="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent text-white disabled:opacity-50"
			disabled={!canSend}
			aria-label={t('chat.send')}
			title={t('chat.send')}
		>
			<Icon name="send" class="h-4 w-4" />
		</button>
	</form>
</div>
