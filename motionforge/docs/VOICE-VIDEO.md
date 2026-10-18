# Voice-over → video pipeline

```
voice file ──decode──► AudioBuffer ──detectSpeech──► speech spans
                                   │
script lines ──alignScript─────────┴──► sections (snapped to pauses)
                                        │ splitLong (no shot longer than ~pace×1.8)
                                        ▼
                               planShots ──► one shot per section (no repeat within 3)
                                        │ validatePlan (coverage, gaps, repeats, length)
                                        ▼
            buildVoiceProject ──► Project: story2d layer per section, caption box +
                                  subtitle cues, voice clip (never trimmed), music bed
                                        ▼
                     Renderer (deterministic t → frame) ──► preview & export
```

- `src/engine/storyboard.ts` — pure functions, unit-tested (16 / 45 / 90 s).
- `src/engine/voiceVideo.ts` — builds the project; video length = decoded voice
  length + outro (ending policy: 0 / 0.6 / 1.5 / 3 s).
- `src/engine/scenes3d/story2d.ts` — the shots; each is timed relative to its
  own layer length, so it adapts to any section duration.
- `src/engine/refAnalysis.ts` — local reference analysis: sampled frames,
  cuts, average shot length, palette, brightness/saturation, contact sheet.
  It does not understand objects, text or meaning.
- `src/ui/VoiceVideoSheet.tsx` — Home → “Voice-over → Video”.

What the app cannot do on the device: transcribe speech. Subtitles and the
choice of shot come from the script the user types; without a script the
sections follow the pauses only.

## Looks (visual systems)

The storyboard (timing, shot kinds, subtitles) is the same for every look; the
look only changes how each shot is drawn (`story2d` param `style`).

| Look | Background | Materials / type | Transition |
|---|---|---|---|
| `app` — App concept | light UI, meadow, keyboard | white panels, Montserrat + Inter | 0.3 s dissolve |
| `glass` — Liquid Glass | moving aurora (brand colours + magenta/violet) | translucent panes with lit rim, white text | 0.3 s dissolve |
| `cinema` — Cinematic Type | near-black, film grain, letterbox | own shots: Oswald uppercase word slams, mono labels, numbered lists, film strip, terminal typing, Ken Burns | hard cut + punch-in + short white flash |

Limits: glass panes are drawn translucency, not a real backdrop blur; cinema
with no pictures shows generated document pages in the Ken Burns / film strip
shots.

## Next: enhancing the user's own Reel footage (not built yet)

The same pieces carry over: a video layer (the footage) at the bottom, the
footage's audio through `detectSpeech` for phrase timing, `refAnalysis`'s cut
detection for scene changes, and story shots / text layers placed on top at
those times. Still missing: a video layer type in the renderer that decodes
frames deterministically for export (mediabunny is already a dependency),
and any real understanding of what the footage shows.
