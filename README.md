# Sing Maker

English | [Español](README.es.md)

**Vocal exercises made to measure.** A web app for singers: pick a vocalization exercise, it adapts to your vocal range,
and you sing it while guiding a character. Notes are perches (branches) with stars; the character flies to the pitch you
sing and collects the stars when you hit the note in tune.

Built for the **Meta AI Developer Hackathon** (Oct 27 – Nov 4, 2026). The AI is an **on-demand composer of vocal
exercises**: it creates exercises from text, from a spoken or sung phrase, from a photo of sheet music or from a drawing,
and it also draws the game's characters, objects and backgrounds. It uses Meta's models (see the table below).

**Try it:** https://singmaker.pages.dev (designed for a phone held sideways; it can be used in demo mode without a microphone).

## What's included

- **The game**: you sing and the character follows your voice; 4 pitch-difficulty levels, drums (4/4 and 6/8), guide piano,
  tempo, zoom, a demo mode without a microphone, and Spanish/English.
- **Exercises**: a catalog of 30 exercises in 3 levels (plus a hidden library of 51 that unlocks as you progress) and
  "My exercises", created with AI.
- **Level test and routine**: an 8-stage played test (it can be paused and resumed) and "Today's routine", with vocal
  techniques and exercises matched to the person's level.
- **Customize**: your own characters, collectible objects and backgrounds created with AI, which can be exported and imported.
- **Shareable card** with your result, drawn with the game's canvas (no AI cost).
- **Installable as an app** (PWA, button at the bottom of Settings): opens fullscreen and in landscape, with no browser
  bar. On iPhone, add it from "Share → Add to Home Screen".

## Running it

```bash
npm install
cp .dev.vars.example .dev.vars   # and fill in the model key (see "Creating exercises with AI")
npm run dev                      # http://127.0.0.1:4380
npm run validate                 # typecheck + lint + tests + build
```

Without a key, the catalog exercises and the game work as usual; what needs the model is "Create with AI", the coach and
the characters. It deploys to Cloudflare Pages: `npm run build && npx wrangler pages deploy build --project-name singmaker`.

Without a microphone you can try it in **Demo mode** (an autopilot sings the notes).

## How it works

- **Exercise format**: text relative to the root note (`2 =`, `1 +4`, `.5 -3`, `!hint`, `r`, `~`, `.`), with metadata
  `@name`, `@bpm`, `@syllable`, `@direction`. See `src/lib/music/parser.ts`.
- **Expansion to the range**: `generateSequence` repeats the pattern on every root that fits the chosen range.
- **Pitch detection**: YIN in the browser (`src/lib/audio/pitch.ts`); audio never leaves the device.
- **Single clock**: the game uses the `AudioContext` clock, so the guide piano and the scene never drift apart; the view is
  shifted by the detector's estimated latency.
- **Themes**: the engine (`src/lib/game/game.ts`) only computes timing, camera and scoring; a `Theme` does the drawing.
  Two kinds of character: flyers (`themes/sky.ts`, the bird follows your voice) and walkers (`themes/path.ts`, the bunny
  jumps between platforms and drops back to the path during silence).

## Time signature and drums

Durations are always written in quarter notes (`0.5` = an eighth note). In simple meters (`@beatsPerMeasure: 4`) the beat
is the quarter note; in 6/8 (`@beatsPerMeasure: 6`, `@subdivision: 8`) the beat is the eighth note and a measure lasts 3
quarter notes (`src/lib/music/meter.ts`). The count-in lasts one measure and every repetition starts on a new one.

The **drums** button accompanies the exercise with a pattern for its time signature (the count-in uses clicks; there is no
separate metronome) (`src/lib/audio/drums.ts`): Basic, Rock and Rock + fill in 4/4, and Basic and Ballad in 6/8 (in 6/8 the
kick falls on 1 and the snare on 4). It uses a drum sample from a previous project by the author. The **/2** button plays
it at half speed (every step lasts twice as long), so that in fast rhythms the melody's quarter notes sound like eighth
notes. The **"Create with AI"** button in the rhythms popup asks the model for a new pattern (`/api/drums`: a validated step
grid per instrument) that is added to the list for the chosen time signature.

## Meta models used

| Model                     | What for                                                                                                                                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Muse Spark 1.3**        | Composes the exercises and drum patterns (validated JSON), reads sheet music and drawings, gives the recommendation after an exercise, and interprets requests for characters, objects and backgrounds. |
| **Muse Wonder**           | Re-reads bass-clef sheet music (on request, any other image too) and **reviews every pose sheet** that Muse Image draws before it is used.                                                              |
| **Muse Image**            | Draws the characters and their pose sheets, the objects and the backgrounds.                                                                                                                            |
| **SAM 3.1**               | Cuts out each pose and the objects from the photos.                                                                                                                                                     |
| **Muse Voice Transcribe** | Dictation: you speak and the phrase becomes the request for an exercise.                                                                                                                                |

## Creating exercises with AI

The **"Create with AI"** button sends a text description to `/api/generate` (a Cloudflare Pages Function in
`functions/api/generate.ts`). The server builds the prompt with examples from the catalog, asks the model for structured
JSON, validates it with `zod` and musical rules (durations, leaps, the person's range) and, if it fails, sends the errors
back so the model can fix them (up to 3 attempts). The result is saved in "My exercises". The model key lives only on the
server. Before practicing you can **listen** to the result and **edit the notes** in a piano roll.

**Dictation**: the microphone inside the text box records what you say, converts it to 16 kHz WAV in the browser, and
`/api/transcribe` turns it into text with **Muse Voice Transcribe** (`POST /v1/asr/transcribe`); that text creates the
exercise directly. If the request names the time signature ("six by eight"), it is picked automatically.

**Time signature**: when composing you choose 4/4 or 6/8. The model receives the rules for that meter and the server
checks that the pattern (guide included) fills whole measures; if not, it asks the model to fix it. This way the drums and
the notes never drift apart.

**From an image** (sheet music or a drawing): in the same dialog you upload a photo or image (also by dragging it in or
pasting it with Ctrl+V; on a phone you can take it with the camera). It is shrunk in the browser and the model reads it.
Two cases:

- **Sheet music** (printed or handwritten): the model transcribes the main melody by writing out each note name as it
  appears, and the app computes the intervals (more reliable than the model's own counting).
- **Melody drawing**: taller and shorter rectangles, left to right; the width of each one is its duration and the words on
  top are the notes (DO, RE, MI…). You can upload a photo of a paper drawing or draw it on the dialog's **canvas**
  (`DrawPattern.svelte`: drag to draw blocks, stretch them from the right edge, and give them a name); the canvas is
  turned into an image and read by the same model. If it has no names, you write the scale in the text box ("I want this
  exercise in C major") and, if you write nothing, the model asks which scale to read it in.

**Who reads the image**: Spark first, because it is cheaper. If it reads sheet music in **bass clef** (where Spark mixes
up pitches), the server re-reads it with **Muse Wonder** alone, which in our tests is far more accurate there. And on any
reading, the **"Re-read with Wonder"** button reads it again with the stronger model (it also measures the widths of a
drawing better), at the cost of more credits. The result can always be listened to and corrected in the piano roll.

**Sing the pattern** (note button next to the microphone, in "Create exercise"): you record a few seconds of singing or
humming. The transcription is local (`src/lib/music/transcribe.ts`, no audio is sent anywhere): it splits notes by
sustained pitch changes, silences and volume attacks (the consonants of repeated notes, like "do-do"), ignoring slides and
vibrato; it estimates the tempo from the median between notes, quantizes to eighth or sixteenth notes, completes the
measure and adds the guide note. It is then reviewed in the piano roll (in the key it was sung in) and, if wanted, the AI
arranges it into a tidier pattern and names it. It is experimental: with real voices it still needs tuning.

**Preview**: when any exercise starts, the character faces forward ("Listen to the tones") and the first repetition plays
once before the count-in, without the guide note (which sounds only while practicing).

The provider is configurable (OpenAI-compatible API), in `.dev.vars` for development (see `.dev.vars.example`) or as
project variables in Cloudflare:

| Variable               | Hackathon (Meta)                                                               |
| ---------------------- | ------------------------------------------------------------------------------ |
| `LLM_API_KEY`          | Meta Model API key                                                             |
| `LLM_BASE_URL`         | `https://api.meta.ai/v1`                                                       |
| `LLM_MODEL`            | `muse-spark-1.3-contributor`                                                   |
| `LLM_VISION_MODEL`     | `muse-wonder-1.0` (default with Meta): bass clef, "Re-read", pose-sheet review |
| `LLM_IMAGE_MODEL`      | `muse-image-1.0` (default)                                                     |
| `LLM_SEGMENT_MODEL`    | `sam-3.1` (default)                                                            |
| `LLM_TRANSCRIBE_MODEL` | `muse-voice-transcribe-1.0`                                                    |
| `LLM_JSON_MODE`        | `schema`, or `object`/`none` if the provider does not support it               |
| `LLM_REASONING_EFFORT` | `low` (default with Meta)                                                      |

## Characters, objects and backgrounds with AI

"Customize" creates a character (that runs or flies), a collectible object or a background from a text or a photo. It is a
chain of models, from cheapest to most expensive: **Spark** interprets the request (and rejects what doesn't fit), **Muse
Image** draws the character and its pose sheets (a grid, one pose per cell), **Muse Wonder reviews every sheet** (one pose
per cell, none cut off, the same character, a plain green background?) and, if it sees a clear defect, the sheet is redrawn
with instructions on what to fix, and **SAM** cuts out each pose. The browser assembles the frame sheets
(`src/lib/character/`). Everything is stored on the device and can be exported and imported.

For backgrounds meant for walking characters, **Spark also looks at the image** to say where the ground starts and which
kind of platforms suit the landscape (log, stone, ice, cloud, crystal or mushroom; it can be changed in the preview). The
platform colors are sampled from the background itself and drawn in code (`src/lib/game/themes/platform.ts`): no extra
image costs anything.

## Quotas and spending

To cap the spending of credits, each device has default limits (changeable with the `LIMIT_*` variables): **200 exercises
and drum patterns**, **40 characters**, 300 images (pose sheets and backgrounds, with their retries) and 3000 minor calls.
They are counted in a Cloudflare D1 database (`DB` binding in `wrangler.toml`, `src/lib/server/quota.ts`); without the
database everything is open (local development). Each browser sends an anonymous identifier (`X-Client-Id`); there are no
accounts and no personal data.

## Code origin ("new work only" rule)

The project was started from scratch on Oct 26/27, 2026. Some parts were adapted from other projects by the author:

| File                            | What it is                           | Changes                                |
| ------------------------------- | ------------------------------------ | -------------------------------------- |
| `src/lib/music/parser.ts`       | reader of the exercise format        | typed, `@bpm`, `@syllable`, syllables  |
| `src/lib/music/notes.ts`        | note utilities                       | solfège                                |
| `src/lib/music/generate.ts`     | expansion of a pattern to the range  | rewritten: repetitions, rests, timing  |
| `src/lib/audio/pitch.ts`        | pitch detector (YIN)                 | class with per-frame reading           |
| `src/lib/audio/engine.ts`       | audio: sampled piano and synthesizer | reduced to sampled piano + synthesizer |
| `src/lib/data/exercises.json`   | catalog of 30 exercises in 3 levels  | fields reduced                         |
| Configuration (svelte, eslint…) | project configuration                | simplified                             |
| Drum sample                     | drum sounds                          | used as is                             |

**New in the hackathon**: the game (engine, camera, character physics, star scoring, the "Sky" theme with parallax), the
sprite processing (`scripts/process-sprites.mjs`), the interface and the tests.

## Assets

- "Sky" theme: `assets/sky/character-sheet.png` (standing bird, first frame), `assets/sky/character2-sheet.png` (flying
  bird, 6 frames) and `static/themes/sky/background.jpg` (background) and `assets/sky/tree1.png`/`tree2.png` (starting
  trees), generated by the author with Meta AI; the sprites are cropped and scaled to `static/themes/sky/bird-rest.png` and
  `bird-fly.png` with `npm run sprites`.
- "Path" theme: `assets/path/bunny-poses.png` and `bunny-move.png` (bunny standing, walking and jumping) and
  `static/themes/path/background.jpg` (background), generated by the author with Meta AI; `npm run sprites` turns them into
  `static/themes/path/bunny-rest.png` and `bunny-move.png`.
- Collectibles: `assets/collectibles/notes-sheet.png` (notes) and `carrots-sheet.png` (carrots), generated by the author
  with Meta AI; `npm run sprites` converts them to `static/collectibles/`.
- Logo and favicons: `assets/logo/logo.png` (winking bird, generated by the author with Meta AI), with `npm run logo`.
- Installed-app icons (`static/icons/`, `apple-touch-icon.png`): the same bird on the blue gradient of the buttons, with
  `python scripts/process-icons.py` (Pillow).
- Piano samples: the author's own CDN (`singapp.b-cdn.net`).
