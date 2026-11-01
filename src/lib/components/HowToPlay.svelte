<script lang="ts">
	// Cómo se juega, para quien nunca vio el juego: play, escuchar las notas, nota guía, objetos a recoger y
	// qué significa que un objeto quede en gris. Va antes del test de nivel (guía de inicio y diálogo del test).
	import { PASS_PERCENT } from '$lib/exercises/placement';
	import { t } from '$lib/i18n';
	import Icon from './Icon.svelte';
</script>

<ul class="mt-3 space-y-3 text-sm">
	<li class="flex items-center gap-3">
		<span class="relative grid h-11 w-11 shrink-0 place-items-center" aria-hidden="true">
			<span class="absolute inset-0 animate-pulse rounded-full ring-4 ring-accent"></span>
			<span class="grid h-9 w-9 place-items-center rounded-full bg-accent text-white">
				<Icon name="play" class="ml-0.5 h-5 w-5" />
			</span>
		</span>
		<span>{t('how.play')}</span>
	</li>
	<li class="flex items-center gap-3">
		<span class="grid h-11 w-11 shrink-0 place-items-center text-accent" aria-hidden="true">
			<Icon name="note" class="h-7 w-7" />
		</span>
		<span>{t('how.listen')}</span>
	</li>
	<li class="flex items-center gap-3">
		<span
			class="grid h-11 w-11 shrink-0 place-items-center bg-linear-to-b from-[#ffe066] via-[#ffa41b] to-[#ff6a00] bg-clip-text font-display text-2xl text-transparent [-webkit-text-stroke:1px_#7c2d12]"
			aria-hidden="true">Do</span
		>
		<span>{t('how.guide')}</span>
	</li>
	<li class="flex items-center gap-3">
		<span
			class="hud-3d grid h-11 w-11 shrink-0 place-items-center text-3xl leading-none text-star"
			aria-hidden="true">★</span
		>
		<span>{t('how.collect')}</span>
	</li>
	<li class="flex items-center gap-3">
		<span
			class="grid h-11 w-11 shrink-0 place-items-center text-3xl leading-none text-star grayscale"
			aria-hidden="true">★</span
		>
		<span>{t('how.gray', { pass: PASS_PERCENT })}</span>
	</li>
</ul>
