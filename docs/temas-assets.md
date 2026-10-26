# Temas: lista de assets y prompts

Qué imágenes hacen falta para cambiar el personaje y el escenario del juego, con medidas, formato y un prompt
base para generarlas con IA (Muse Image u otra). Cada tema es un conjunto cerrado de assets más un archivo
`src/lib/game/themes/<id>.ts` que los dibuja. El motor (`src/lib/game/game.ts`) no cambia entre temas.

## 1. Cómo funciona el juego (lo que las imágenes tienen que respetar)

- **Vista lateral, avance hacia la derecha.** El personaje queda fijo en el 26 % izquierdo de la pantalla y el
  mundo se desplaza hacia la izquierda. Todo personaje mira **a la derecha**.
- **Altura = tono.** Cada nota del ejercicio es una "percha" a la altura de su tono; la cámara muestra unos
  13–20 semitonos. Una percha mide de ~20 px (corchea rápida) a ~400 px (nota larga) de ancho.
- **Coleccionables sobre la percha.** Cada nota cantable lleva 1 coleccionable cada ~0,28 s
  (hoy: estrellas). Se dibujan a 18–30 px de diámetro, así que tienen que leerse a tamaño chico.
- **Notas guía** (`!hint`): suenan pero no se cantan; se marcan distinto (hoy, línea punteada con ♪).
- **Estados del personaje:** en el suelo esperando (antes de Volar), en movimiento sin voz, en movimiento
  cantando, y "afinado" (brilla cuando canta la nota justa).
- **Inicio y final:** el personaje arranca parado en un suelo de partida que termina 1 s por delante de él;
  al terminar aparece la pantalla de resultados.

## 2. Reglas generales para todas las imágenes

| Regla            | Valor                                                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Formato          | PNG con transparencia real (salvo el fondo, que va en JPG)                                                                            |
| Vista            | Lateral (perfil), cámara a la altura del personaje, sin perspectiva fuerte                                                            |
| Orientación      | Mirando a la derecha                                                                                                                  |
| Estilo           | El mismo en todo el tema: 3D tipo caricatura, colores saturados, bordes limpios (ver §6)                                              |
| Luz              | Desde arriba a la izquierda, sombras suaves, **sin sombra proyectada en el piso**                                                     |
| Contenido        | Sin texto, sin logos, sin marcos, sin personajes ni marcas con derechos de terceros                                                   |
| Hojas de cuadros | Cuadros del mismo tamaño, en una fila, mismo encuadre y escala; el personaje no se mueve de lugar entre cuadros (solo cambia la pose) |
| Márgenes         | ~5 % de margen transparente alrededor; nada cortado por el borde                                                                      |

Proceso: la imagen original va a `assets/<tema>/`, y `npm run sprites` (`scripts/process-sprites.mjs`) la
recorta al contorno común, la escala y la deja en `static/themes/<tema>/` con un `.json` de medidas.

## 3. Assets de un tema (lista completa)

Prioridad: **O** = obligatorio, **R** = recomendado, **X** = extra.

| #   | Asset                      | Prio | Archivo final              | Formato y medidas de entrega                                         | Para qué                                       |
| --- | -------------------------- | ---- | -------------------------- | -------------------------------------------------------------------- | ---------------------------------------------- |
| 1   | Personaje: hoja de cuadros | O    | `character.png` + `.json`  | Fila de N cuadros cuadrados de 512×512, ver §4 según el tipo         | Animación del personaje                        |
| 2   | Fondo                      | O    | `background.jpg`           | 2048×1152 (16:9), JPG                                                | Escenario que se desplaza al 30 % de velocidad |
| 3   | Coleccionable              | O    | `collectible.png`          | 256×256, centrado, ocupa ~80 %                                       | Reemplaza la estrella                          |
| 4   | Suelo de partida: tramo    | O    | `ground.png`               | 512×256, **repetible en horizontal**, superficie en el 25 % superior | Donde espera el personaje antes de empezar     |
| 5   | Suelo de partida: borde    | O    | `ground-end.png`           | 256×256, mismo alto y superficie que el tramo, borde a la derecha    | Final del suelo (barranco, muelle, borde)      |
| 6   | Marca de nota guía         | R    | `hint.png`                 | 128×128                                                              | Reemplaza el ♪ de las notas que solo suenan    |
| 7   | Coleccionable recogido     | R    | `collectible-burst.png`    | Fila de 4 cuadros de 256×256 (destello que se abre y se apaga)       | Efecto al recoger                              |
| 8   | Capa delantera             | X    | `foreground.png`           | 2048×384, repetible en horizontal, transparente arriba               | Paralaje cercano (pasto, olas) al 120 %        |
| 9   | Meta                       | X    | `goal.png`                 | 512×512                                                              | Nido, bandera o puerta al final del ejercicio  |
| 10  | Ilustración de resultados  | X    | `results.png`              | 1024×768                                                             | Personaje festejando en la pantalla final      |
| 11  | Percha visible             | X    | `perch-left/mid/right.png` | 3 piezas de 128×64; la del medio repetible en horizontal             | Solo si el tema dibuja la percha (ver §5)      |

### Especificaciones por asset

**2. Fondo.** Se repite en espejo de forma alternada (normal, invertido, normal…), así que **no debe tener
elementos asimétricos llamativos** (texto, un sol en un borde, un edificio cortado). La franja central (del
20 % al 80 % de la altura) es donde vuelan las notas: tiene que ser de **bajo contraste y sin detalles
finos**, para que los coleccionables se lean encima. No debe haber horizonte ni piso marcado en la mitad de
abajo, porque las notas pueden estar en cualquier altura. Ejemplo actual: `static/themes/sky/background.jpg`.

**3. Coleccionable.** Silueta simple y reconocible a 20 px: estrella, moneda, nota musical, gema, fruta.
Color que contraste con el fondo (si el fondo es azul, amarillo o naranja). Sin sombra externa (el brillo lo
agrega el código). El estado "perdido" lo hace el código en gris; el "recogido" usa el asset 7 si existe.

Los coleccionables **no dependen del tema**: se eligen en «Personalizar» y se combinan con cualquier
escenario (`src/lib/game/collectibles.ts`). Van en `assets/collectibles/<id>-sheet.png` como una fila de
**variantes** del mismo objeto (por ejemplo, 4 colores); cada nota del ejercicio usa una variante, así los
objetos de una misma nota comparten color. `npm run sprites` los deja en `static/collectibles/<id>.png`.
Ejemplo: `assets/collectibles/notes-sheet.png` (4 notas musicales: roja, amarilla, verde y violeta).

**4–5. Suelo.** El personaje se para sobre la superficie: la línea de pisada tiene que estar **a la misma
altura en el tramo y en el borde**, a 1/4 del alto de la imagen. El tramo se repite hacia la izquierda.
El borde termina en la derecha de forma clara (es desde donde despega o salta el personaje).

## 4. El personaje según cómo se mueve

### 4.1 Volador (actual: pájaro)

Se mueve libre en vertical; la altura sigue al tono cantado.

| Cuadro | Pose                                  | Uso                          |
| ------ | ------------------------------------- | ---------------------------- |
| 0      | Alas arriba                           | Ciclo de aleteo              |
| 1      | Alas horizontales                     | Ciclo de aleteo              |
| 2      | Alas plegadas, parado sobre las patas | En el suelo antes de empezar |
| 3      | Alas a media altura                   | Ciclo de aleteo              |

Ciclo de aleteo: 0 → 3 → 1 → 2 → 1 → 3, a 7 cuadros/s sin voz, 10 cantando y 12 afinado. El cuerpo, la cabeza
y los ojos deben estar **en el mismo lugar en los 4 cuadros**. Otros voladores posibles: abeja, murciélago,
dragón bebé, globo aerostático, avioncito de papel, pez (escenario submarino).

### 4.2 Saltador (estilo plataformas)

Cada nota es una **plataforma** a la altura del tono, con los coleccionables flotando encima. El personaje
corre sobre la plataforma de la nota actual. Al cambiar de nota **salta** (sube) o **se deja caer** (baja) hasta
la altura que cantás. Sin voz, cae hasta la plataforma más cercana o al piso del fondo.

| Cuadro | Pose                              | Uso                             |
| ------ | --------------------------------- | ------------------------------- |
| 0      | Parado, de perfil                 | Antes de empezar                |
| 1–4    | Corriendo (ciclo de 4 pasos)      | Sobre una plataforma            |
| 5      | Despegue (piernas flexionadas)    | Inicio del salto                |
| 6      | Subiendo (brazos arriba)          | Velocidad vertical hacia arriba |
| 7      | Cayendo (brazos abiertos)         | Velocidad vertical hacia abajo  |
| 8      | Aterrizaje (rodillas flexionadas) | Al tocar la plataforma          |
| 9      | Festejo                           | Fin del ejercicio               |

Assets extra: percha visible obligatoria (asset 11: plataforma de ladrillo, nube sólida, tronco, hongo) y
coleccionable tipo moneda (opcional: 4 cuadros de moneda girando). La plataforma se dibuja de la longitud de la
nota con las 3 piezas (borde izquierdo, medio repetido, borde derecho).

Cambios de código (pendientes): en el tema, `movement: 'jump'`; la altura del personaje se anima con una
parábola corta (~0,25 s) en vez de seguir el tono directamente, y el cuadro se elige por la velocidad
vertical (subiendo, cayendo, aterrizando) en lugar de por el aleteo.

### 4.3 Escalador (escaleras)

Cada nota es un **escalón**: una escala ascendente se ve como una escalera que sube y una descendente como una
que baja. Los escalones se dibujan como bloques desde la altura de la nota hacia abajo, uno pegado al otro
(cada uno del ancho de su nota), así que forman una escalera continua. El personaje camina sobre el escalón de la
nota actual y sube o baja un paso al cambiar de nota.

| Cuadro | Pose                                | Uso               |
| ------ | ----------------------------------- | ----------------- |
| 0      | Parado                              | Antes de empezar  |
| 1–4    | Caminando                           | Sobre el escalón  |
| 5      | Pie adelantado, subiendo un escalón | Al subir de nota  |
| 6      | Pie adelantado, bajando un escalón  | Al bajar de nota  |
| 7      | Festejo                             | Fin del ejercicio |

Assets extra:

| Asset           | Medidas                                     | Detalle                                                |
| --------------- | ------------------------------------------- | ------------------------------------------------------ |
| `step-top.png`  | 256×64, repetible en horizontal             | La pisada del escalón (piedra, madera, tecla de piano) |
| `step-body.png` | 256×256, repetible en vertical y horizontal | El cuerpo del bloque bajo la pisada                    |

Idea con mucho sentido musical: **escalones como teclas de piano** (blancas y negras según la nota).

## 5. ¿Percha visible o invisible?

- **Volador:** la percha es invisible (pedido: solo los coleccionables y el nombre de la nota).
- **Saltador y escalador:** la percha es el piso donde pisa el personaje, así que sí se ve.

## 6. Prompts para generar las imágenes

Bloque de estilo común (pegar al principio de cada prompt del mismo tema, sin cambiarlo, para que todo salga
coherente):

```
Estilo: ilustración 3D de caricatura para un juego infantil, colores saturados y suaves, formas redondeadas,
materiales mate tipo plastilina, luz suave desde arriba a la izquierda, sin sombra proyectada en el piso,
sin texto, sin logos, sin marco. Vista lateral, mirando a la derecha.
```

### Personaje (hoja de cuadros)

```
[ESTILO]
Hoja de sprites de un {personaje: pájaro azul redondo de ojos grandes} para un juego de plataformas en 2D.
{N} cuadros en una sola fila horizontal, todos del mismo tamaño, con el personaje del mismo tamaño y en la
misma posición en cada cuadro; solo cambia la pose. Poses, de izquierda a derecha: {lista de poses de §4}.
Fondo transparente. Separación clara entre cuadros. Cuerpo entero, nada cortado.
```

### Fondo

```
[ESTILO]
Fondo para un juego de desplazamiento lateral: {cielo celeste con nubes esponjosas}. Formato 16:9.
Sin horizonte ni suelo en la mitad inferior, sin personajes, sin elementos que llamen la atención en los
bordes. La franja central es despejada y de poco contraste, porque encima vuelan objetos pequeños.
Distribución pareja, para poder repetirlo en espejo horizontalmente.
```

### Coleccionable

```
[ESTILO]
Un solo objeto coleccionable de videojuego: {estrella dorada brillante}. Centrado, de frente, silueta simple
que se reconozca a 20 píxeles. Fondo transparente, sin sombra.
```

### Suelo de partida (tramo y borde)

```
[ESTILO]
Tramo de suelo para un juego de plataformas en vista lateral: {isla de pasto con tierra debajo}. La superficie
está en el cuarto superior de la imagen y es perfectamente horizontal. Repetible sin costuras en horizontal:
el borde izquierdo y el derecho deben coincidir. Fondo transparente.
```

```
[ESTILO]
Borde final del mismo suelo: {isla de pasto con tierra debajo}, la superficie a la misma altura que el tramo
(cuarto superior), y a la derecha termina en un borde redondeado de barranco. Fondo transparente.
```

### Plataforma (saltador) y escalón (escalador)

```
[ESTILO]
Plataforma flotante para un juego de plataformas en vista lateral, en 3 piezas en una fila: extremo
izquierdo, pieza central repetible en horizontal y extremo derecho. Material: {ladrillos naranjas}.
Superficie superior plana. Fondo transparente.
```

```
[ESTILO]
Bloque de escalón en vista lateral, repetible en horizontal y en vertical: {tecla blanca de piano, de
marfil, con borde superior redondeado}. Fondo transparente.
```

## 7. Temas propuestos

| Tema             | Movimiento | Personaje                   | Fondo                     | Coleccionable    | Suelo / percha                        |
| ---------------- | ---------- | --------------------------- | ------------------------- | ---------------- | ------------------------------------- |
| Cielo (hecho)    | Volador    | Pájaro azul                 | Cielo con nubes           | Estrella         | Isla de pasto / invisible             |
| Bosque           | Saltador   | Zorrito o duende            | Bosque desenfocado        | Moneda o bellota | Hongos o troncos                      |
| Escalera musical | Escalador  | Nena o nene con auriculares | Sala de conciertos difusa | Nota musical     | Teclas de piano                       |
| Mar              | Volador    | Pez globo                   | Agua azul con burbujas    | Perla            | Arrecife / invisible                  |
| Espacio          | Volador    | Cohete pequeño              | Cielo estrellado          | Planeta o cometa | Plataforma de lanzamiento / invisible |
