import { describe, expect, it } from 'vitest';
import {
	buildItemZip,
	buildSceneZip,
	importItem,
	importScene
} from '../src/lib/character/assetsIO';
import { ImportError, readZip } from '../src/lib/character/import';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const sheet = {
	blob: new Blob([PNG], { type: 'image/png' }),
	frames: 2,
	frameWidth: 80,
	frameHeight: 90
};

async function filesOf(zip: Blob) {
	return readZip(new Uint8Array(await zip.arrayBuffer()));
}

describe('exportar objetos y fondos', () => {
	it('el zip de un objeto trae la hoja y su manifiesto', async () => {
		const files = await filesOf(
			await buildItemZip({ name: 'Moneda Musical', sheet, style: 'cute3d' })
		);
		expect([...files.keys()].sort()).toEqual(['item.json', 'moneda-musical.png']);
		const m = JSON.parse(new TextDecoder().decode(files.get('item.json')));
		expect(m).toMatchObject({
			kind: 'item',
			name: 'Moneda Musical',
			sheet: { file: 'moneda-musical.png', frames: 2, frameWidth: 80, frameHeight: 90 }
		});
	});

	it('el zip de un fondo trae la imagen, el tipo y la altura del suelo', async () => {
		const image = new Blob([PNG], { type: 'image/png' });
		const files = await filesOf(
			await buildSceneZip({ name: 'Arrecife', movement: 'fly', image, ground: 0.865 })
		);
		expect([...files.keys()].sort()).toEqual(['arrecife.png', 'scene.json']);
		const m = JSON.parse(new TextDecoder().decode(files.get('scene.json')));
		expect(m).toMatchObject({
			kind: 'scene',
			movement: 'fly',
			ground: 0.865,
			image: 'arrecife.png'
		});
	});
});

describe('importar objetos y fondos', () => {
	it('rechaza un zip de fondo al importar un objeto y al revés', async () => {
		const scene = await buildSceneZip({
			name: 'Bosque',
			movement: 'walk',
			image: new Blob([PNG]),
			ground: 0.8
		});
		const item = await buildItemZip({ name: 'Moneda', sheet });
		await expect(importItem(scene)).rejects.toMatchObject({ code: 'noManifest' });
		await expect(importScene(item)).rejects.toMatchObject({ code: 'noManifest' });
	});

	it('rechaza archivos que no son un zip', async () => {
		const junk = new Blob([new Uint8Array(100)]);
		await expect(importItem(junk)).rejects.toBeInstanceOf(ImportError);
		await expect(importScene(junk)).rejects.toBeInstanceOf(ImportError);
	});
});
