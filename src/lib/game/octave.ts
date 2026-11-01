// Aviso de octava equivocada: la persona canta la nota correcta, pero una octava arriba o abajo, y el juego
// no la cuenta. Solo avisa cuando varias notas seguidas lo confirman, para no marcar un error suelto.

/** Notas seguidas, cantadas bien de nombre pero en otra octava, que hacen falta para avisar. */
const NOTES_TO_WARN = 3;
/** Tiempo mínimo (s) cantando en la otra octava para dar una nota por confirmada (o el 40 % de una más corta). */
const MIN_SEC = 0.18;
/** Después de un aviso no se repite antes de este tiempo (s). */
const COOLDOWN_SEC = 6;
/** Un cuadro nunca suma más que esto (s): tras un corte largo no se da por cantada toda la nota. */
const MAX_STEP_SEC = 0.25;
/** Margen (semitonos) para decir que el nombre de la nota es el correcto: más holgado que el de acertar. */
const PITCH_CLASS_TOLERANCE = 0.75;

export interface OctaveTarget {
	id: number;
	midi: number;
	duration: number;
}

export class OctaveWatch {
	private streak = 0;
	private noteId = -1;
	private off = 0;
	private ok = 0;
	private counted = false;
	private lastWarn = -Infinity;
	private lastTime = 0;

	reset(): void {
		this.streak = 0;
		this.noteId = -1;
		this.off = 0;
		this.ok = 0;
		this.counted = false;
		this.lastWarn = -Infinity;
		this.lastTime = 0;
	}

	/**
	 * Un cuadro de juego: `note` es la nota a cantar ahora (null en silencios y guías), `voice` el tono
	 * cantado y `time` el reloj del ejercicio (así un equipo lento, con pocos cuadros por segundo, cuenta lo
	 * mismo que uno rápido). Devuelve true cuando hay que mostrar el aviso.
	 */
	feed(note: OctaveTarget | null, voice: number | null, time: number, tolerance: number): boolean {
		// Tiempo desde el cuadro anterior; al retomar tras una pausa el reloj retrocede y no suma.
		const dt = Math.min(MAX_STEP_SEC, Math.max(0, time - this.lastTime));
		this.lastTime = time;
		const id = note ? note.id : -1;
		if (id !== this.noteId) {
			// Terminó una nota que no estuvo en otra octava: se corta la racha.
			if (this.noteId !== -1 && !this.counted) this.streak = 0;
			this.noteId = id;
			this.off = 0;
			this.ok = 0;
			this.counted = false;
		}
		if (!note || voice === null) return false;

		const d = voice - note.midi;
		const octaves = Math.round(d / 12);
		if (Math.abs(d) <= tolerance) this.ok += dt;
		else if (
			octaves !== 0 &&
			Math.abs(octaves) <= 2 &&
			Math.abs(d - octaves * 12) <= Math.max(tolerance, PITCH_CLASS_TOLERANCE)
		)
			this.off += dt;

		if (this.counted || this.ok > 0 || this.off < Math.min(MIN_SEC, note.duration * 0.4)) return false;
		this.counted = true;
		this.streak++;
		if (this.streak < NOTES_TO_WARN) return false;
		this.streak = 0;
		if (time - this.lastWarn < COOLDOWN_SEC) return false;
		this.lastWarn = time;
		return true;
	}
}
