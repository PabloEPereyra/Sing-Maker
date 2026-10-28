// Lectura de la respuesta de SAM 3.1 (Meta Model API, POST /v1/responses con `sam-3.1`).
// El modelo devuelve texto con una caja y una máscara por objeto encontrado:
//   <0f>0<|box;x1=31;y1=27;x2=445;y2=399;w=600;h=400|><|mask;x=0;y=0;data=373,415,!payload|>,1<|box…
// Con `metadata: { mask_encoding: 'one_bit' }` la máscara es binaria y su payload (base85) se decodifica
// con un modelo de contexto + codificador de rango. Este decodificador es una adaptación en TypeScript
// de `@meta-sam/parser` (decodeMaskToRaster, rama one_bit) de Meta Platforms, Inc., publicado bajo la
// SAM License (https://dev.meta.ai/docs/sam/client-libraries): Copyright (c) Meta Platforms, Inc.
// and affiliates. All Rights Reserved. Se omite la verificación de forma canónica de la reconstrucción.

export interface SamObject {
	id: string;
	/** Caja en píxeles de la imagen enviada (x2/y2 inclusivos). */
	box: { x1: number; y1: number; x2: number; y2: number };
	/** Máscara binaria de la caja: `h` filas por `w` columnas, fila por fila. */
	mask: { w: number; h: number; data: Uint8Array };
	confidence?: number;
}

const EXCLUDED = new Set(['"', '\\', ',', ';', '<', '>', '|']);
const ALPHABET = (() => {
	let v = '';
	for (let code = 0x21; code <= 0x7e; code++) {
		const ch = String.fromCharCode(code);
		if (!EXCLUDED.has(ch)) v += ch;
	}
	return v;
})();
const RADIX = 85;
const PREFIX = 5;
const VALUES = new Int16Array(128).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) VALUES[ALPHABET.charCodeAt(i)] = i;

const TOP = 1 << 24;
const BOTTOM = 1 << 16;
const MASK32 = 0xffffffff;
const INCREMENT = 14;
const COUNT_LIMIT = 4096;
const CONTEXTS = 1 << 12;
const PAD = 2;

function digit(ch: string): number {
	const code = ch.charCodeAt(0);
	const v = code < 128 ? VALUES[code] : -1;
	if (v < 0 || v >= RADIX) throw new Error('Máscara de SAM con un carácter inválido.');
	return v;
}

/** Base85 con prefijo de largo (5 dígitos) -> bytes. */
function unpack(payload: string): Uint8Array {
	if (payload.length < PREFIX) throw new Error('Máscara de SAM truncada.');
	let length = 0;
	for (let i = 0; i < PREFIX; i++) length = length * RADIX + digit(payload[i]);
	const rem = length % 4;
	const expected = PREFIX + Math.floor(length / 4) * 5 + (rem === 0 ? 0 : rem + 1);
	if (payload.length !== expected) throw new Error('Máscara de SAM con largo inconsistente.');
	const out = new Uint8Array(length);
	let src = PREFIX;
	let dst = 0;
	for (; dst < length - rem; dst += 4) {
		let v = 0;
		for (let i = 0; i < 5; i++) v = v * RADIX + digit(payload[src + i]);
		if (v > MASK32) throw new Error('Máscara de SAM fuera de rango.');
		src += 5;
		out[dst] = (v >>> 24) & 0xff;
		out[dst + 1] = (v >>> 16) & 0xff;
		out[dst + 2] = (v >>> 8) & 0xff;
		out[dst + 3] = v & 0xff;
	}
	if (rem > 0) {
		let v = 0;
		for (let i = 0; i < 5; i++) v = v * RADIX + (i < rem + 1 ? digit(payload[src + i]) : RADIX - 1);
		for (let i = 0; i < rem; i++) out[dst + i] = (v >>> (24 - i * 8)) & 0xff;
	}
	return out;
}

class RangeDecoder {
	private input: Uint8Array;
	private pos = 0;
	private low = 0;
	private range = MASK32;
	private code = 0;
	private scaled = 0;

	constructor(input: Uint8Array) {
		if (input.length < 4) throw new Error('Máscara de SAM sin cierre.');
		this.input = input;
		for (let i = 0; i < 4; i++) this.code = ((this.code << 8) | this.read()) >>> 0;
	}

	private read(): number {
		if (this.pos >= this.input.length) throw new Error('Máscara de SAM incompleta.');
		return this.input[this.pos++];
	}

	frequency(total: number): number {
		this.scaled = Math.floor(this.range / total);
		if (this.scaled === 0) throw new Error('Máscara de SAM con estado inválido.');
		const v = Math.floor(((this.code - this.low) >>> 0) / this.scaled);
		return v >= total ? total - 1 : v;
	}

	decode(cumulative: number, frequency: number): void {
		this.low = (this.low + this.scaled * cumulative) >>> 0;
		this.range = this.scaled * frequency;
		while (
			(this.low ^ (this.low + this.range)) >>> 0 < TOP ||
			(this.range < BOTTOM && ((this.range = (-this.low >>> 0) & (BOTTOM - 1)), true))
		) {
			this.code = ((this.code << 8) | this.read()) >>> 0;
			this.low = (this.low << 8) >>> 0;
			this.range = (this.range << 8) >>> 0;
		}
	}
}

/** Decodifica una máscara `one_bit` (payload que empieza con `!`) a un arreglo de 0 y 1 de h*w. */
export function decodeOneBit(payload: string, w: number, h: number): Uint8Array {
	if (!payload.startsWith('!')) throw new Error('Se esperaba una máscara one_bit (empieza con !).');
	const decoder = new RangeDecoder(unpack(payload.slice(1)));
	const counts = new Uint16Array(CONTEXTS * 2).fill(1);
	const pw = w + 2 * PAD;
	const padded = new Uint8Array(pw * (h + PAD));
	const out = new Uint8Array(w * h);
	for (let y = 0; y < h; y++) {
		const row = (y + PAD) * pw + PAD;
		for (let x = 0; x < w; x++) {
			const p = row + x;
			const prior = p - pw;
			const earlier = p - 2 * pw;
			const ctx =
				padded[p - 1] |
				(padded[p - 2] << 1) |
				(padded[prior - 2] << 2) |
				(padded[prior - 1] << 3) |
				(padded[prior] << 4) |
				(padded[prior + 1] << 5) |
				(padded[prior + 2] << 6) |
				(padded[earlier - 2] << 7) |
				(padded[earlier - 1] << 8) |
				(padded[earlier] << 9) |
				(padded[earlier + 1] << 10) |
				(padded[earlier + 2] << 11);
			const off = ctx << 1;
			const zero = counts[off];
			const one = counts[off + 1];
			const bit = decoder.frequency(zero + one) < zero ? 0 : 1;
			if (bit === 0) decoder.decode(0, zero);
			else decoder.decode(zero, one);
			padded[p] = bit;
			out[y * w + x] = bit;
			counts[off + bit] += INCREMENT;
			if (counts[off] + counts[off + 1] >= COUNT_LIMIT) {
				counts[off] = counts[off] >> 1 || 1;
				counts[off + 1] = counts[off + 1] >> 1 || 1;
			}
		}
	}
	return out;
}

const RECORD =
	/(\d+)<\|box;x1=(\d+);y1=(\d+);x2=(\d+);y2=(\d+);w=\d+;h=\d+(?:;c=([\d.]+))?\|><\|mask;x=\d+;y=\d+(?:;c=[\d.]+)?;data=(\d+),(\d+),([^|]*)\|>/g;

/** Texto de la respuesta de SAM (una imagen) -> objetos con caja y máscara. Los inválidos se descartan. */
export function parseSamText(text: string): SamObject[] {
	const objects: SamObject[] = [];
	for (const m of text.matchAll(RECORD)) {
		const [, id, x1, y1, x2, y2, c, h, w, payload] = m;
		try {
			objects.push({
				id,
				box: { x1: +x1, y1: +y1, x2: +x2, y2: +y2 },
				mask: { w: +w, h: +h, data: decodeOneBit(payload, +w, +h) },
				confidence: c === undefined ? undefined : +c
			});
		} catch {
			// Una máscara dañada no invalida a las demás.
		}
	}
	return objects;
}
