<script lang="ts">
	// Globo de ayuda con el estilo del juego para todo el sitio: toma el atributo `title` de cualquier
	// elemento (lo pasa a `data-tooltip` para que el navegador no muestre el suyo) y lo muestra al pasar el
	// mouse o al enfocar con el teclado. Se pone una sola vez en el layout; no hace falta tocar cada botón.
	import { onMount } from 'svelte';

	const GAP = 12;
	const MARGIN = 8;
	const DELAY = 380;
	const HOSTS = '[title], [data-tooltip], button[aria-label]';

	let text = $state('');
	let box = $state<{ x: number; y: number; w: number; h: number } | null>(null);
	let size = $state({ w: 0, h: 0 });
	let viewport = $state({ w: 0, h: 0 });
	let current: Element | null = null;
	let timer: ReturnType<typeof setTimeout> | undefined;

	/** Pasa `title` a `data-tooltip` (sin perder el nombre accesible) y devuelve el texto. */
	function take(el: Element): string {
		const title = el.getAttribute('title');
		if (title) {
			el.setAttribute('data-tooltip', title);
			el.removeAttribute('title');
			if (!el.hasAttribute('aria-label') && !el.textContent?.trim()) {
				el.setAttribute('aria-label', title);
			}
		}
		const tip = el.getAttribute('data-tooltip');
		if (tip) return tip;
		// Botones de solo icono (o ✕, ←, +…) que tienen nombre accesible pero no `title`.
		const label = el.getAttribute('aria-label');
		return el instanceof HTMLButtonElement && label && (el.textContent?.trim().length ?? 0) <= 2
			? label
			: '';
	}

	function hide() {
		clearTimeout(timer);
		current = null;
		box = null;
	}

	function show(el: Element) {
		const r = el.getBoundingClientRect();
		viewport = { w: window.innerWidth, h: window.innerHeight };
		box = { x: r.x, y: r.y, w: r.width, h: r.height };
	}

	function enter(el: Element | null, delay: number) {
		// El elemento más cercano que tenga algo para decir (un botón con texto largo cede al de afuera).
		let host = el?.closest(HOSTS) ?? null;
		let tip = host ? take(host) : '';
		while (host && !tip) {
			host = host.parentElement?.closest(HOSTS) ?? null;
			tip = host ? take(host) : '';
		}
		if (!host || host === current) return;
		hide();
		current = host;
		text = tip;
		if (delay) timer = setTimeout(() => current === host && show(host), delay);
		else show(host);
	}

	onMount(() => {
		const over = (e: PointerEvent) => {
			if (e.pointerType !== 'touch') enter(e.target as Element, DELAY);
		};
		const out = (e: PointerEvent) => {
			if (current && !current.contains(e.relatedTarget as Node | null)) hide();
		};
		const focus = (e: FocusEvent) => {
			const el = e.target as Element;
			if (el.matches?.(':focus-visible')) enter(el, 0);
		};
		const opts = { capture: true, passive: true } as const;
		document.addEventListener('pointerover', over, opts);
		document.addEventListener('pointerout', out, opts);
		document.addEventListener('focusin', focus, opts);
		document.addEventListener('focusout', hide, opts);
		document.addEventListener('pointerdown', hide, opts);
		document.addEventListener('keydown', hide, opts);
		document.addEventListener('wheel', hide, opts);
		window.addEventListener('scroll', hide, opts);
		return () => {
			hide();
			document.removeEventListener('pointerover', over, opts);
			document.removeEventListener('pointerout', out, opts);
			document.removeEventListener('focusin', focus, opts);
			document.removeEventListener('focusout', hide, opts);
			document.removeEventListener('pointerdown', hide, opts);
			document.removeEventListener('keydown', hide, opts);
			document.removeEventListener('wheel', hide, opts);
			window.removeEventListener('scroll', hide, opts);
		};
	});

	// Arriba del control; si no entra, abajo. Siempre dentro de la pantalla.
	const above = $derived(box ? box.y - size.h - GAP >= MARGIN : true);
	const left = $derived(
		box
			? Math.max(MARGIN, Math.min(viewport.w - size.w - MARGIN, box.x + box.w / 2 - size.w / 2))
			: 0
	);
	const top = $derived(box ? (above ? box.y - size.h - GAP : box.y + box.h + GAP) : 0);
	const arrowLeft = $derived(
		box ? Math.max(16, Math.min(size.w - 16, box.x + box.w / 2 - left)) : 16
	);
</script>

{#if box && text}
	<div
		class="game-tooltip pointer-events-none fixed z-[90]"
		style:left="{left}px"
		style:top="{top}px"
		role="tooltip"
		bind:clientWidth={size.w}
		bind:clientHeight={size.h}
	>
		<span
			class="game-tooltip-arrow absolute h-3 w-3 rotate-45"
			style:left="{arrowLeft - 6}px"
			style:top={above ? undefined : '-7px'}
			style:bottom={above ? '-7px' : undefined}
			aria-hidden="true"
		></span>
		{text}
	</div>
{/if}
