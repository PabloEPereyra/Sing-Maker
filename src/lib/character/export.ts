// Exportar un personaje: un .zip con las tiras de cuadros en PNG con transparencia y un JSON con lo
// necesario para usarlas en otro lado (cuadros, tamaño de cada cuadro, tipo de movimiento). Los .json de
// cada hoja tienen el mismo formato que los de static/themes/.
import type { CharacterMeta, SheetRecord } from './store.svelte';
import type { Movement } from './spec';
import { zipStore } from './zip';

export interface ExportableCharacter {
	name: string;
	movement: Movement;
	stand: SheetRecord;
	move: SheetRecord;
	jump?: SheetRecord;
	meta?: CharacterMeta;
}

/** Nombre de archivo seguro a partir del nombre del personaje. */
export function slug(name: string, fallback = 'personaje'): string {
	return (
		name
			.normalize('NFD')
			.replace(/[̀-ͯ]/g, '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 40) || fallback
	);
}

const SHEET_ROLES: Record<string, string> = {
	stand: 'cuadro 0: parado de perfil; cuadro 1: de frente',
	move: 'ciclo de carrera o aleteo, mirando a la derecha',
	jump: 'despegue, subida y bajada (solo caminantes)'
};

export async function buildExportZip(c: ExportableCharacter): Promise<Blob> {
	const base = slug(c.name);
	const sheets = Object.entries({ stand: c.stand, move: c.move, jump: c.jump }).filter(
		(e): e is [string, SheetRecord] => !!e[1]
	);
	const entries = [];
	const meta: Record<string, unknown> = {};
	for (const [role, sheet] of sheets) {
		entries.push({
			name: `${base}-${role}.png`,
			data: new Uint8Array(await sheet.blob.arrayBuffer())
		});
		const info = {
			frames: sheet.frames,
			frameWidth: sheet.frameWidth,
			frameHeight: sheet.frameHeight
		};
		entries.push({
			name: `${base}-${role}.json`,
			data: new TextEncoder().encode(JSON.stringify(info, null, '\t') + '\n')
		});
		meta[role] = { file: `${base}-${role}.png`, ...info, description: SHEET_ROLES[role] };
	}
	// Con qué se creó (para poder retocarlo después de importarlo): descripción y la imagen de referencia.
	let source: Record<string, unknown> | undefined;
	if (c.meta) {
		const ref = c.meta.reference.match(/^data:image\/jpeg;base64,(.+)$/);
		if (ref) {
			entries.push({
				name: `${base}-reference.jpg`,
				data: Uint8Array.from(atob(ref[1]), (ch) => ch.charCodeAt(0))
			});
		}
		source = {
			visual: c.meta.visual,
			noun: c.meta.noun,
			flight: c.meta.flight,
			style: c.meta.style,
			reference: ref ? `${base}-reference.jpg` : undefined
		};
	}
	entries.push({
		name: 'character.json',
		data: new TextEncoder().encode(
			JSON.stringify(
				{
					name: c.name,
					movement: c.movement,
					note: 'Hojas de cuadros iguales en fila (PNG con transparencia), apoyadas en el borde inferior (caminante) o centradas (volador).',
					sheets: meta,
					source
				},
				null,
				'\t'
			) + '\n'
		)
	});
	return new Blob([zipStore(entries) as BlobPart], { type: 'application/zip' });
}

/** Descarga un archivo generado en el navegador. */
export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Descarga el personaje como `<nombre>.zip`. */
export async function downloadCharacter(c: ExportableCharacter): Promise<void> {
	downloadBlob(await buildExportZip(c), `${slug(c.name)}.zip`);
}
