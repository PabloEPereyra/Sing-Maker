// Pistas progresivas: cada control se explica una sola vez, cuando ya se jugó lo suficiente como
// para que tenga sentido (como en los juegos de celular). Lo visto y la cuenta de ejercicios
// terminados se guardan en el navegador.
const KEY = 'singmaker-tips';

export interface Tip {
	id: 'play' | 'tempo' | 'guide' | 'create' | 'customize';
	/** Ejercicios terminados que hacen falta antes de mostrarla. */
	after: number;
}

/** En orden: la primera que corresponda y no se haya visto. */
export const TIPS: Tip[] = [
	{ id: 'play', after: 0 },
	{ id: 'tempo', after: 1 },
	{ id: 'guide', after: 2 },
	{ id: 'create', after: 3 },
	{ id: 'customize', after: 4 }
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

export function nextTip(): Tip | undefined {
	return TIPS.find((tip) => tip.after <= tips.done && !tips.seen.includes(tip.id));
}

export function markSeen(id: string): void {
	if (!tips.seen.includes(id)) tips.seen = [...tips.seen, id];
	save();
}

export function markAllSeen(): void {
	tips.seen = TIPS.map((tip) => tip.id);
	save();
}
