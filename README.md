# Sing Maker

**Ejercicios vocales a tu medida.** App web para cantantes: elegís un ejercicio de vocalización, se ajusta a
tu rango de voz y lo cantás guiando a un personaje. Las notas son perchas (ramas) con estrellas; el pájaro vuela
a la altura que cantás y junta las estrellas cuando afinás la nota.

Proyecto para el **Meta AI Developer Hackathon** (27 oct – 4 nov 2026). Próximo paso: un chat con Muse (Meta)
que crea ejercicios a partir de texto, de una frase cantada o de la foto de una partitura.

## Cómo correrlo

```bash
npm install
npm run dev        # http://127.0.0.1:4380
npm run validate   # typecheck + lint + tests + build
```

Sin micrófono se puede probar con **Modo demo** (un piloto automático canta las notas).

## Cómo funciona

- **Formato de ejercicio**: texto relativo a la nota raíz (`2 =`, `1 +4`, `.5 -3`, `!hint`, `r`, `~`, `.`),
  con metadatos `@name`, `@bpm`, `@syllable`, `@direction`. Ver `src/lib/music/parser.ts`.
- **Expansión al rango**: `generateSequence` repite el patrón en cada raíz que entra en el rango elegido.
- **Detección de tono**: YIN en el navegador (`src/lib/audio/pitch.ts`); el audio nunca sale del dispositivo.
- **Reloj único**: el juego usa el reloj del `AudioContext`, así el piano guía y la escena no se desfasan; la
  vista se corre según la latencia estimada del detector.
- **Temas**: el motor (`src/lib/game/game.ts`) solo calcula tiempos, cámara y puntuación; el dibujo lo hace un
  `Theme` (`src/lib/game/themes/sky.ts`). Otros mundos (caminante con monedas, etc.) se suman con otro tema.

## Origen del código (regla "new work only")

El proyecto se comenzó desde cero el 26/27 oct 2026. Se reutilizaron, adaptadas, piezas de proyectos previos
del autor:

| Archivo nuevo                   | Origen                                                       | Cambios                                    |
| ------------------------------- | ------------------------------------------------------------ | ------------------------------------------ |
| `src/lib/music/parser.ts`       | `vocalizator/src/scripts/parser.ts`                          | tipado, `@bpm`, `@syllable`, sílabas       |
| `src/lib/music/notes.ts`        | `vocalizator/src/scripts/exercises.ts` (utilidades de notas) | solfeo                                     |
| `src/lib/music/generate.ts`     | `vocalizator/src/scripts/exercises.ts` (`generateFromCode`)  | reescrito: repeticiones, pausas, tiempos   |
| `src/lib/audio/pitch.ts`        | `vocalizator/src/scripts/pitch.ts`                           | clase con lectura por cuadro               |
| `src/lib/audio/engine.ts`       | `vocalizator/src/scripts/audio.ts`                           | reducido a piano muestreado + sintetizador |
| `src/lib/data/exercises.json`   | `vocalizator/src/data/ejercicios.json` (77 ejercicios)       | campos reducidos                           |
| Configuración (svelte, eslint…) | `voicexplorer`                                               | simplificada                               |

**Nuevo en el hackathon**: el juego (motor, cámara, física del personaje, puntuación por estrellas, tema
"Cielo" con paralaje), el procesado del sprite (`scripts/process-sprites.mjs`), la interfaz y los
tests.

## Recursos

- Tema "Cielo": `assets/sky/character-sheet.png` (pájaro parado, primer cuadro), `assets/sky/character2-sheet.png` (pájaro volando, 6 cuadros) y `static/themes/sky/background.jpg` (fondo) y `assets/sky/tree1.png`/`tree2.png` (árboles de partida), generados por el autor con Meta AI; los sprites se recortan y escalan a `static/themes/sky/bird-rest.png` y `bird-fly.png`
  con `npm run sprites`.
- Logo y favicons: `assets/logo/logo.png` (pájaro guiñando, generado por el autor con Meta AI), con `npm run logo`.
- Muestras de piano: CDN propio del autor (`singapp.b-cdn.net`).
