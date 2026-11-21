<script lang="ts">
	// Página de texto legal (términos, privacidad o precios): se lee en vertical o en horizontal, con el texto
	// seleccionable y el idioma que la persona eligió en el juego (se puede cambiar acá mismo).
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { UPDATED, type LegalDoc } from '$lib/legal';
	import { loadSettings, settings, type Lang } from '$lib/settings.svelte';

	type Page = 'terms' | 'privacy' | 'pricing';
	let { doc, current }: { doc: (lang: Lang) => LegalDoc; current: Page } = $props();
	/** Las otras dos páginas, para el pie. */
	const others = $derived((['pricing', 'terms', 'privacy'] as const).filter((p) => p !== current));

	let lang = $state<Lang>(settings.lang);
	onMount(() => {
		loadSettings();
		lang = settings.lang;
	});

	$effect(() => {
		document.documentElement.lang = lang;
	});

	const content = $derived(doc(lang));

	/** Párrafos en orden, con los «• » seguidos agrupados en una lista. */
	type Block = { kind: 'p'; text: string } | { kind: 'ul'; items: string[] };
	function blocks(body: string[]): Block[] {
		const out: Block[] = [];
		for (const text of body) {
			const last = out.at(-1);
			if (!text.startsWith('• ')) out.push({ kind: 'p', text });
			else if (last?.kind === 'ul') last.items.push(text.slice(2));
			else out.push({ kind: 'ul', items: [text.slice(2)] });
		}
		return out;
	}
	const labels = $derived(
		lang === 'es'
			? {
					back: '← Volver al juego',
					updated: 'Última actualización',
					terms: 'Términos de uso',
					privacy: 'Política de privacidad',
					pricing: 'Precios'
				}
			: {
					back: '← Back to the game',
					updated: 'Last updated',
					terms: 'Terms of use',
					privacy: 'Privacy policy',
					pricing: 'Pricing'
				}
	);
</script>

<svelte:head>
	<title>{content.title} · Vocal Quest</title>
</svelte:head>

<div class="legal h-dvh overflow-y-auto select-text">
	<main class="mx-auto max-w-2xl px-4 py-6 sm:py-10">
		<nav class="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
			<a href={resolve('/')} class="font-semibold text-accent hover:underline">{labels.back}</a>
			<div class="flex gap-1" role="group" aria-label="Idioma / Language">
				{#each ['es', 'en'] as const as l (l)}
					<button
						class="rounded-lg px-2.5 py-1 {lang === l
							? 'bg-accent text-white'
							: 'border border-border bg-surface'}"
						aria-pressed={lang === l}
						onclick={() => (lang = l)}>{l.toUpperCase()}</button
					>
				{/each}
			</div>
		</nav>
		<article class="bg-surface p-5 text-fg shadow-sm sm:p-8">
			<h1 class="text-3xl leading-tight">{content.title}</h1>
			<p class="mt-1 text-sm text-muted">{labels.updated}: {UPDATED[lang]}</p>
			<p class="mt-4">{content.intro}</p>
			{#each content.sections as section (section.title)}
				<h2 class="mt-6 text-xl">{section.title}</h2>
				{#each blocks(section.body) as block, i (i)}
					{#if block.kind === 'p'}
						<p class="mt-2 leading-relaxed">{block.text}</p>
					{:else}
						<ul class="mt-2 list-disc space-y-1 pl-5 leading-relaxed">
							{#each block.items as item (item)}
								<li>{item}</li>
							{/each}
						</ul>
					{/if}
				{/each}
			{/each}
			<p class="mt-8 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-4 text-sm">
				{#each others as page (page)}
					<a href={resolve(`/${page}`)} class="font-semibold text-accent hover:underline"
						>{labels[page]}</a
					>
				{/each}
			</p>
		</article>
	</main>
</div>
