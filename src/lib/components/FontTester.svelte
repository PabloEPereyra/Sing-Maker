<script lang="ts">
	// TEMPORAL: barra para probar tipografías en vivo. Cambia `--font-display` (principal: títulos, botones,
	// números) y `--font-sans` (secundaria: textos corridos), con tamaño y peso a elección. Para eso baja el CSS
	// de Google Fonts y lo reescribe con un nombre propio: `size-adjust` da el tamaño y, si se fija un peso, se
	// pide solo esa instancia y se declara válida para todos los pesos (así manda sobre los `font-semibold`).
	// Se borra, junto con su uso en +page.svelte, cuando se decida la combinación.
	import { onMount } from 'svelte';

	type Key = 'display' | 'sans';
	interface Cfg {
		name: string;
		/** Escala del tamaño, en %. */
		size: number;
		/** Peso fijo (100–900); 0 deja los pesos que pida cada elemento. */
		weight: number;
	}

	/** Fuente → rango de pesos de Google Fonts (null: un solo peso, no se puede variar). */
	const FONTS: Record<string, [number, number] | null> = {
		'Road Rage': null,
		Chewy: null,
		'Mouse Memoirs': null,
		Boogaloo: null,
		'Caveat Brush': null,
		'Bricolage Grotesque': [400, 800],
		'Baloo 2': [400, 800]
	};
	/** Fuentes que se ofrecen para cada uso. */
	const CHOICES: Record<Key, string[]> = {
		display: [
			'Road Rage',
			'Chewy',
			'Mouse Memoirs',
			'Boogaloo',
			'Caveat Brush',
			'Bricolage Grotesque'
		],
		sans: ['Chewy', 'Boogaloo', 'Bricolage Grotesque', 'Baloo 2']
	};
	const KEY = 'singmaker.fonttest3';
	const GROUPS: [Key, string][] = [
		['display', 'Principal'],
		['sans', 'Secundaria']
	];

	const initial = (): Record<Key, Cfg> => ({
		display: { name: 'Chewy', size: 100, weight: 0 },
		sans: { name: 'Baloo 2', size: 100, weight: 0 }
	});

	let cfg = $state(initial());
	/** Fuentes que Google Fonts no devolvió (nombre mal escrito o inexistente). */
	let failed = $state<Record<Key, boolean>>({ display: false, sans: false });

	// caché simple de los CSS ya bajados; no hace falta que sea reactiva
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const cache = new Map<string, string>();
	const token: Record<Key, number> = { display: 0, sans: 0 };
	const styles: Partial<Record<Key, HTMLStyleElement>> = {};

	/** Pesos disponibles de una fuente, de cien en cien. */
	function weights(name: string): number[] {
		const axis = FONTS[name];
		if (!axis) return [];
		const out: number[] = [];
		for (let w = axis[0]; w <= axis[1]; w += 100) out.push(w);
		return out;
	}

	async function apply(key: Key) {
		const { name, size, weight } = cfg[key];
		const axis = FONTS[name];
		const fixed = axis && weights(name).includes(weight) ? weight : 0;
		const spec = axis ? `:wght@${fixed || `${axis[0]}..${axis[1]}`}` : '';
		const url = `https://fonts.googleapis.com/css2?family=${name.replaceAll(' ', '+')}${spec}&display=swap`;
		const mine = ++token[key];

		let css = cache.get(url);
		if (css === undefined) {
			try {
				const res = await fetch(url);
				if (!res.ok) throw new Error(String(res.status));
				css = await res.text();
				cache.set(url, css);
			} catch {
				if (mine === token[key]) failed[key] = true;
				return;
			}
		}
		if (mine !== token[key]) return;
		failed[key] = false;

		const face = `FT ${key}`;
		css = css
			.replace(/font-family:\s*'[^']*';/g, `font-family: '${face}';`)
			.replace(/@font-face\s*\{/g, `@font-face { size-adjust: ${size}%;`);
		if (fixed) css = css.replace(/font-weight:\s*[^;]+;/g, 'font-weight: 100 900;');
		styles[key]!.textContent = css;
		document.documentElement.style.setProperty(
			`--font-${key}`,
			`'${face}', ui-rounded, system-ui, sans-serif`
		);
		try {
			localStorage.setItem(KEY, JSON.stringify(cfg));
		} catch {
			// sin almacenamiento: solo vale para esta sesión
		}
	}

	/** Pasa a la fuente anterior (−1) o siguiente (+1) de la lista, con vuelta. */
	function step(key: Key, d: number) {
		const names = CHOICES[key];
		cfg[key].name = names[(names.indexOf(cfg[key].name) + d + names.length) % names.length];
		cfg[key].weight = 0;
		void apply(key);
	}

	function reset() {
		cfg = initial();
		void apply('display');
		void apply('sans');
	}

	onMount(() => {
		for (const key of ['display', 'sans'] as const) {
			const style = document.createElement('style');
			document.head.append(style);
			styles[key] = style;
		}
		try {
			const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
			if (
				saved &&
				CHOICES.display.includes(saved.display?.name) &&
				CHOICES.sans.includes(saved.sans?.name)
			) {
				cfg = saved;
			}
		} catch {
			// valor guardado ilegible: se queda con los de fábrica
		}
		void apply('display');
		void apply('sans');
		return () => Object.values(styles).forEach((s) => s?.remove());
	});
</script>

<!-- Fuera de la tipografía del juego (system-ui) para que la barra no cambie al probar -->
<div
	class="relative z-[60] flex flex-wrap items-center gap-x-5 gap-y-1 bg-black/85 px-3 py-1 text-xs text-white"
	style="font-family: system-ui, sans-serif"
>
	<span class="font-bold tracking-wide uppercase">Fuentes (temporal)</span>
	{#each GROUPS as [key, label] (key)}
		<div class="flex items-center gap-1.5">
			<span>{label}:</span>
			<button
				class="rounded bg-white/15 px-2 py-0.5 hover:bg-white/30"
				aria-label="{label} anterior"
				onclick={() => step(key, -1)}>‹</button
			>
			<select
				class="rounded bg-white px-1 py-0.5 text-black {failed[key]
					? 'outline-2 outline-red-500'
					: ''}"
				aria-label="{label}: fuente"
				bind:value={cfg[key].name}
				onchange={() => {
					cfg[key].weight = 0;
					void apply(key);
				}}
			>
				{#each CHOICES[key] as n (n)}
					<option value={n}>{n}</option>
				{/each}
			</select>
			<button
				class="rounded bg-white/15 px-2 py-0.5 hover:bg-white/30"
				aria-label="{label} siguiente"
				onclick={() => step(key, 1)}>›</button
			>
			<label class="flex items-center gap-1">
				Tamaño
				<input
					type="range"
					min="60"
					max="150"
					step="5"
					class="w-20"
					aria-label="{label}: tamaño"
					bind:value={cfg[key].size}
					oninput={() => apply(key)}
				/>
				<span class="w-9 tabular-nums">{cfg[key].size}%</span>
			</label>
			<label class="flex items-center gap-1">
				Peso
				<select
					class="rounded bg-white px-1 py-0.5 text-black disabled:opacity-50"
					aria-label="{label}: peso"
					disabled={!FONTS[cfg[key].name]}
					value={cfg[key].weight}
					onchange={(e) => {
						cfg[key].weight = Number(e.currentTarget.value);
						void apply(key);
					}}
				>
					<option value={0}>{FONTS[cfg[key].name] ? 'Auto' : 'Único'}</option>
					{#each weights(cfg[key].name) as w (w)}
						<option value={w}>{w}</option>
					{/each}
				</select>
			</label>
			{#if failed[key]}<span class="text-red-400">no carga</span>{/if}
		</div>
	{/each}
	<button class="rounded bg-white/15 px-2 py-0.5 hover:bg-white/30" onclick={reset}
		>Restablecer</button
	>
</div>
