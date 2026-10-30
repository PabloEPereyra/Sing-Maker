// Pistas progresivas: cada control se explica una sola vez, cuando ya se jugó lo suficiente como
// para que tenga sentido (como en los juegos de celular). Lo visto y la cuenta de ejercicios
// terminados se guardan en el navegador.
const KEY = 'singmaker-tips';

export type TipId =
	'play' | 'options' | 'exercises' | 'rhythms' | 'range' | 'create' | 'customize' | 'voice';

export interface Tip {
	id: TipId;
	/** Ejercicios terminados que hacen falta antes de mostrarla. */
	after: number;
	/** Dónde se muestra: la pantalla principal (por defecto) o el creador de ejercicios. */
	scope?: 'create';
}

/** En orden: la primera que corresponda y no se haya visto. */
export const TIPS: Tip[] = [
	{ id: 'play', after: 0 },
	{ id: 'options', after: 1 },
	{ id: 'exercises', after: 1 },
	{ id: 'rhythms', after: 3 },
	{ id: 'range', after: 4 },
	{ id: 'create', after: 4 },
	{ id: 'customize', after: 5 },
	{ id: 'voice', after: 0, scope: 'create' }
];

export const tips = $state<{ seen: string[]; done: number }>({ seen: [], done: 0 });

function save(): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(tips));
	} catch {
		// sin almacenamiento: solo dura esta sesión
	}
}

export function loadTips(): void {
	try {
		const s = JSON.parse(localStorage.getItem(KEY) ?? '{}');
		if (Array.isArray(s.seen)) tips.seen = s.seen.filter((x: unknown) => typeof x === 'string');
		if (typeof s.done === 'number') tips.done = Math.max(0, Math.floor(s.done));
	} catch {}
}

export function recordDone(): void {
	tips.done++;
	save();
}

/** La próxima pista de la pantalla principal o, con `scope`, del creador de ejercicios. */
export function nextTip(scope?: 'create'): Tip | undefined {
	return TIPS.find(
		(tip) => tip.scope === scope && tip.after <= tips.done && !tips.seen.includes(tip.id)
	);
}

export function markSeen(id: string): void {
	if (!tips.seen.includes(id)) tips.seen = [...tips.seen, id];
	save();
}

export function markAllSeen(): void {
	tips.seen = TIPS.map((tip) => tip.id);
	save();
}
