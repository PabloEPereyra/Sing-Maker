# Sing Maker

**Ejercicios vocales a tu medida.** App web para cantantes: elegís un ejercicio de vocalización, se ajusta a
tu rango de voz y lo cantás guiando a un personaje. Las notas son perchas (ramas) con estrellas; el pájaro vuela
a la altura que cantás y junta las estrellas cuando afinás la nota.

Proyecto para el **Meta AI Developer Hackathon** (27 oct – 4 nov 2026). La IA es un **compositor de ejercicios
vocales a pedido**: crea ejercicios a partir de texto, de una frase hablada o cantada, de la foto de una partitura o de
un dibujo, y también dibuja los personajes, objetos y fondos del juego. Usa los modelos de Meta (ver la tabla de abajo).

## Qué incluye

- **El juego**: cantás y el personaje sigue tu voz; dificultad de afinación en 4 niveles, batería (4/4 y 6/8), piano guía,
  tempo, zoom, modo demo sin micrófono y español/inglés.
- **Ejercicios**: catálogo de 30 ejercicios en 3 niveles (más una biblioteca oculta de 51 que se desbloquea) y «Mis
  ejercicios», creados con IA.
- **Test de nivel y rutina**: una prueba jugada de 8 etapas (se puede dejar para después y retomar) y «Tu rutina de hoy»,
  con técnicas vocales y ejercicios del nivel de la persona.
- **Personalizar**: personajes, objetos para recoger y fondos propios creados con IA, que se exportan e importan.
- **Tarjeta compartible** con el resultado, hecha con el canvas del juego (sin gasto de IA).

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
  `Theme`. Dos tipos de personaje: voladores (`themes/sky.ts`, el pájaro sigue la voz) y terrestres
  (`themes/path.ts`, la coneja salta entre plataformas y en silencio cae al sendero).

## Compás y batería

Las duraciones se escriben siempre en negras (`0.5` = corchea), como en vocalizator. En compases simples
(`@beatsPerMeasure: 4`) el pulso es la negra; en 6/8 (`@beatsPerMeasure: 6`, `@subdivision: 8`) el pulso es la
corchea y un compás dura 3 negras (`src/lib/music/meter.ts`). La cuenta previa dura un compás y cada repetición
empieza en uno nuevo.

El botón de **batería** acompaña con un patrón del compás del ejercicio (la cuenta previa va con clics; no hay
metrónomo aparte) (`src/lib/audio/drums.ts`): Básico, Rock y Rock + fill en 4/4 (los de vocalizator) y Básico y Balada en 6/8
(el 6/8 de vocalizator tenía el bombo cada dos corcheas, como un 3/4; acá va bombo en 1 y caja en 4). Usa la
muestra de batería de vocalizator. El botón **/2** la pasa a la mitad de velocidad (cada paso dura el doble),
para que en ritmos rápidos las negras de la melodía suenen como corcheas. El botón **«Crear con
IA»** del popup de ritmos le pide al modelo un patrón nuevo (`/api/drums`: grilla de pasos por instrumento, validada)
que se suma a la lista del compás elegido.

## Modelos de Meta que usa

| Modelo                    | Para qué                                                                                                                                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Muse Spark 1.3**        | Compone los ejercicios y los patrones de batería (JSON validado), lee partituras y dibujos, da la recomendación al terminar un ejercicio e interpreta los pedidos de personajes, objetos y fondos. |
| **Muse Wonder**           | Relee las partituras en clave de fa (a pedido también cualquier otra imagen) y **revisa cada hoja de poses** que dibuja Muse Image antes de usarla.                                                |
| **Muse Image**            | Dibuja los personajes y sus hojas de poses, los objetos y los fondos.                                                                                                                              |
| **SAM 3.1**               | Recorta cada pose y los objetos de las fotos.                                                                                                                                                      |
| **Muse Voice Transcribe** | Dictado: se habla y la frase se convierte en el pedido de un ejercicio.                                                                                                                            |

## Crear ejercicios con IA

El botón **«Crear con IA»** manda una descripción en texto a `/api/generate` (Cloudflare Pages Function en
`functions/api/generate.ts`). El servidor arma el prompt con ejemplos del catálogo, pide al modelo un JSON
estructurado, lo valida con `zod` y reglas musicales (duraciones, saltos, rango de la persona) y, si falla,
le devuelve los errores para que corrija (hasta 3 intentos). El resultado se guarda en «Mis ejercicios».
La clave del modelo vive solo en el servidor. Antes de practicar se puede **escuchar** el resultado y
**editar las notas** en un piano roll.

**Dictado**: el micrófono dentro del cuadro de texto graba lo que decís, lo convierte a WAV de 16 kHz en el
navegador y `/api/transcribe` lo pasa a texto con **Muse Voice Transcribe** (`POST /v1/asr/transcribe`); con
ese texto se crea el ejercicio directamente. Si el pedido nombra el compás («seis por ocho»), se elige solo.

**Compás**: al componer se elige 4/4 o 6/8. El modelo recibe las reglas de ese compás y el servidor verifica
que el patrón (guía incluida) llene compases enteros; si no, le pide que corrija. Así la batería y las
notas nunca se desfasan.

**Desde una imagen** (partitura o dibujo): en el mismo diálogo se sube una foto o imagen (también arrastrándola o
pegándola con Ctrl+V; en el celular se puede sacar con la cámara). Se achica en el navegador y el modelo la lee. Dos casos:

- **Partitura** (impresa o escrita a mano): el modelo transcribe la melodía principal escribiendo el nombre de cada nota
  tal como está escrita y la app calcula los intervalos (es más confiable que la cuenta del modelo).
- **Dibujo de la melodía**: rectángulos más altos o más bajos, de izquierda a derecha; el ancho de cada uno es su
  duración y las palabras que lleve encima son las notas (DO, RE, MI…). Se puede subir la foto de un dibujo en papel o
  dibujarlo en el **lienzo** del diálogo (`DrawPattern.svelte`: se arrastra para dibujar bloques, se estiran desde el
  borde derecho y se les puede poner nombre); el lienzo se convierte en una imagen y la lee el mismo modelo. Si no tiene nombres, se escribe la escala en el
  cuadro de texto («quiero este ejercicio en do mayor») y, si no se escribe nada, el modelo pregunta en qué escala leerlo.

**Quién lee la imagen**: Spark primero, porque es más barato. Si lee una partitura en **clave de fa** (donde Spark
confunde alturas), el servidor la relee solo con **Muse Wonder**, que en las pruebas acierta mucho más ahí. Y en
cualquier lectura el botón **«Releer con Wonder»** vuelve a leerla con el modelo más fuerte (también mide mejor los
anchos de un dibujo), a costa de más créditos. El resultado siempre se puede escuchar y corregir en el piano roll.

**Cantar el patrón** (botón de nota junto al micrófono, en «Crear ejercicio»): se graban unos segundos cantando o tarareando. La transcripción es local
(`src/lib/music/transcribe.ts`, sin mandar audio a ningún lado): separa las notas por cambios de tono
sostenidos, silencios y ataques de volumen (las consonantes de notas repetidas, como «do-do»), ignorando la
entrada deslizada y el vibrato; estima el tempo con la mediana entre
notas, cuantiza a corcheas o semicorcheas, completa el compás y agrega la nota guía. Después se revisa en el
piano roll (en la tonalidad en que se cantó) y, si se quiere, la IA lo acomoda en un patrón más prolijo y le
pone nombre. Está en prueba: con voces reales todavía hay que ajustarlo.

**Escucha previa**: al empezar cualquier ejercicio, el personaje mira de frente («Escucha los tonos») y
suena una vez la primera repetición antes de la cuenta, sin la nota guía (que suena solo al practicar).

Proveedor configurable (API compatible con OpenAI), en `.dev.vars` para desarrollo (ver `.dev.vars.example`)
o como variables del proyecto en Cloudflare:

| Variable               | Hackathon (Meta)                                                                   |
| ---------------------- |---------------------------------------------------------------------------------- |
| `LLM_API_KEY`          |  clave de la Meta Model API                                                         |
| `LLM_BASE_URL`         | `https://api.meta.ai/v1`                                                           |
| `LLM_MODEL`            | `muse-spark-1.3-contributor`                                                       |
| `LLM_VISION_MODEL`     |  `muse-wonder-1.0` (por defecto con Meta): clave de fa, «Releer», revisión de poses |
| `LLM_IMAGE_MODEL`      | `muse-image-1.0` (por defecto)                                                     |
| `LLM_SEGMENT_MODEL`    |  `sam-3.1` (por defecto)                                                            |
| `LLM_TRANSCRIBE_MODEL` |  `muse-voice-transcribe-1.0`                                                        |
| `LLM_JSON_MODE`        |  `schema`, u `object`/`none` si no lo admite                                        |
| `LLM_REASONING_EFFORT` | `low` (por defecto en Meta)                                                        |

## Personajes, objetos y fondos con IA

«Personalizar» crea un personaje (que corre o vuela), un objeto para recoger o un fondo a partir de un texto o de una
foto. Es una cadena de modelos, del más barato al más caro: **Spark** interpreta el pedido (y rechaza lo que no
corresponde), **Muse Image** dibuja al personaje y sus hojas de poses (una grilla, una pose por celda), **Muse Wonder
revisa cada hoja** (¿una pose por celda, ninguna cortada, el mismo personaje, fondo verde liso?) y, si ve un defecto claro,
se vuelve a dibujar diciéndole qué corregir, y **SAM** recorta cada pose. El navegador arma las hojas de cuadros
(`src/lib/character/`). Todo se guarda en el dispositivo y se puede exportar e importar.

En los fondos para personajes que caminan, **Spark también mira la imagen** para decir dónde empieza el suelo y qué tipo de
plataformas le van al paisaje (tronco, piedra, hielo, nube, cristal u hongo; se puede cambiar en la vista previa). Los
colores de las plataformas se miden del propio fondo y se dibujan por código (`src/lib/game/themes/platform.ts`): no
cuesta ninguna imagen más.

## Cupos y gasto

Para acotar el gasto de créditos, cada dispositivo tiene topes por defecto (se cambian con las variables `LIMIT_*`):
**200 ejercicios y patrones de batería**, **40 personajes**, 300 imágenes (hojas de poses y fondos, con sus reintentos) y
3000 llamadas menores. Se cuentan en una base D1 de Cloudflare (`src/lib/server/quota.ts`); sin la base, todo queda abierto
(desarrollo local). Hay que fijar además un tope de gasto en la cuenta de Meta.

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
| `src/lib/data/exercises.json`   | `voicexplorer` /vocal-scales (30 ejercicios, 3 niveles)      | campos reducidos                           |
| Configuración (svelte, eslint…) | `voicexplorer`                                               | simplificada                               |

**Nuevo en el hackathon**: el juego (motor, cámara, física del personaje, puntuación por estrellas, tema
"Cielo" con paralaje), el procesado del sprite (`scripts/process-sprites.mjs`), la interfaz y los
tests.

## Recursos

- Tema "Cielo": `assets/sky/character-sheet.png` (pájaro parado, primer cuadro), `assets/sky/character2-sheet.png` (pájaro volando, 6 cuadros) y `static/themes/sky/background.jpg` (fondo) y `assets/sky/tree1.png`/`tree2.png` (árboles de partida), generados por el autor con Meta AI; los sprites se recortan y escalan a `static/themes/sky/bird-rest.png` y `bird-fly.png`
  con `npm run sprites`.
- Tema "Sendero": `assets/path/bunny-poses.png` y `bunny-move.png` (coneja parada, caminando y saltando) y
  `static/themes/path/background.jpg` (fondo), generados por el autor con Meta AI; `npm run sprites` los
  convierte en `static/themes/path/bunny-rest.png` y `bunny-move.png`.
- Coleccionables: `assets/collectibles/notes-sheet.png` (notas) y `carrots-sheet.png` (zanahorias), generados por
  el autor con Meta AI; `npm run sprites` los pasa a `static/collectibles/`.
- Logo y favicons: `assets/logo/logo.png` (pájaro guiñando, generado por el autor con Meta AI), con `npm run logo`.
- Muestras de piano: CDN propio del autor (`singapp.b-cdn.net`).
