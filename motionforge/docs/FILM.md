# Art-directed film (storyboard renderer)

`film` (src/engine/scenes3d/film.ts) plays a whole storyboard in one layer.
The storyboard (src/engine/film/plan.ts) decides every scene: its narration
segment, its scene kind, its exact copy, the beats it reacts to and how it
arrives from the scene before. `buildFilmProject` (src/engine/film/project.ts)
turns it into an editable project: the film layer, the voice-over at its full
length and sound cues derived from the choreography (`filmSfx`).

## Why (what was wrong before)

The earlier HR reel (v2) alternated two unrelated looks every 2–4 s (a dark
purple-glow UI and a pastel 3D world), was assembled by a one-off timeline
script outside the repository, and its shots were generic presets with fixed
layouts filled with text. 3D objects spun continuously, documents and notes
orbited at fixed positions, every dark shot had the same large purple glow,
transitions were hard cuts plus generic flashes, the brand lockup scene was
used twice, and on-screen copy was partly invented. The in-app voice-video
generator (`story2d` + `planShots`) has the same weakness: a keyword picks one
of ten presets; the storyboard does not shape the layout or the transitions.

## Principles taken from the three references

1. One idea per shot, one focal point, large negative space.
2. Type leads: a clean sans, modest sizes, strict alignment; one accent colour.
3. The product's own interface (search field, pills, rows, logo, pointer) is
   the visual language; 3D only where an object carries the message.
4. Motion is fast-out / slow-in (expo), small overshoot only on small pops,
   staggered letters and words; nothing is ever completely still.
5. Continuity: elements carry across cuts (zoom into the object, the logo moves
   up and stays, a pointer acts in several scenes); flashes only at turning points.
6. Every sound sits on a visible action.

## Art direction of the film system

- Light paper (#f3f1ec) and ink (#121214) with one accent (#2b4bff); a dark
  state (#0b0b0d, one soft off-centre light) only for the offer.
- Montserrat 800 for display, Inter 500/600 for interface text; both loaded
  with the Cyrillic-ext subset (Ө ө Ү ү ₮ verified in tests).
- 1080×1920 design space, 96 px margins, content inside y 230–1560 (Reel safe area).
- Scene kinds: question, brand, folders, roll, list, blank, template, counter,
  apps, reveal, price, cta. Transitions: cut, pushUp, zoomIn, swipe, iris, flash.

## Integrity rules (validateStoryboard)

- Scenes cover the whole film with no gaps or overlaps; the film is never shorter than the voice.
- Every on-screen string must appear in the narration or in the storyboard's
  `facts` (brand, prices, real file and folder names). Anything else is an error.
- The brand is never re-cased; beats lie inside their scene; reading time is checked.

## Tests

- `tests/engine.test.ts` — storyboard validation, sound cues, project build.
- `tests/film.mjs [storyboard.json]` — renders frame by frame in Chromium and
  audits what is drawn: safe area, minimum size, overlaps, duplicates, the copy
  of every scene, frozen stretches, blank transitions, fonts.
