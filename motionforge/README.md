# MOTIONFORGE STUDIO

A mobile-first motion graphics studio that runs in iPhone Safari. You get a composition preview, a multi-track keyframe timeline, a typography animation engine, a WebGL2 effects system, a GLSL shader editor, and real video export. No server, account, paid API or MCP connection is needed. Everything runs in the browser.

It is inspired by the workflow of desktop compositing apps. It contains no third-party proprietary code, assets or branding. All rendering, animation and effect code is original, and the bundled libraries are MIT/ISC-licensed open source (see *Licenses*).

---

## Features

| System | What works |
|---|---|
| **Composition** | Text, shape (incl. a liquid corner *swoosh* and *barcode*), image (drop shadow, editor-only empty slots for PNG cut-outs), background, particle and shader layers. Add, delete, duplicate, rename, reorder, show/hide, opacity, position, scale, rotation, blend modes (normal / add / screen / multiply). Track mattes: a shape can mask the layer above it, normally or inverted, with feather. Aspect ratios 9:16, 16:9, 1:1, 4:5. Switching aspect ratio keeps all animation. |
| **Typography engine** | Per-character, per-word, per-line or whole-block animation. 18 working presets: reel-style type pop and blur reveal, smooth reveal, typewriter, letter-spacing expansion, split, character stagger, fade & rise, slide & blur, elastic scale, minimal kinetic, glowing cursor, vertical light bar, glitch, mask reveal, word-by-word, rotating characters, cinematic title. Each has delay, duration, stagger, intensity, direction, order (forward / reverse / center / random), easing (including cubic Bézier) and an optional out-animation. Also: blinking cursor, glowing light bar, horizontal light sweep, blur, glow, kerning-preserving layout, and 12 bundled font families (Poppins, Montserrat, Inter, Unbounded, Space Grotesk, Manrope, Syne, Oswald, Bebas Neue, Playfair Display, Instrument Serif, JetBrains Mono). Mongolian Cyrillic is supported: Latin-only families fall back per glyph to a Cyrillic family of the same style. |
| **Keyframes** | Any numeric or color property can be keyframed, including shader uniforms. Easing is set per segment: linear, ease in/out/in-out, cubic, expo, back, spring, elastic, hold, cubic Bézier. Once a property has keyframes, editing it at a new time adds a keyframe automatically. Keyframes can be copied, pasted, duplicated and deleted. |
| **Timeline** | One track per layer, with expandable property rows and value curves. Drag a ◆ to retime it; tap it to edit time, value and easing. Drag a layer bar to move it (its keyframes move too); drag the handles to trim. Tap or drag the ruler to scrub. Zoom, duration, FPS (24/25/30/50/60), frame stepping, loop, undo/redo. |
| **Effects (GLSL ES 3.00)** | Generators: glow grid (red / cyan / flat), GPU particle field, gradient motion, radial light burst, holographic noise, light tunnel, futuristic HUD, energy pulse, light rays, light sweep, animated lines. Filters that process the layers below: digital glitch (RGB split, displacement, blocks, noise, scanlines, with intensity, frequency and duration), distortion (wave, radial, ripple, heat haze, noise), chromatic aberration, CRT scanlines, glow/bloom, blur, film finish (vignette, grain). Canvas particles add connection lines and touch repulsion. |
| **Shader editor** | CodeMirror with GLSL highlighting. Live or manual compile. Errors show with line numbers, both inline in the gutter and in a list you can tap to jump to the line. A failed compile keeps the last working shader on screen. "Restore working" brings it back. Includes 8 starter shaders plus every built-in effect, and a personal shader library. Uniforms get controls automatically (`// @ui min max default`, `// @color`, `// @select`), and those controls are keyframable. The editor accepts GLSL only and never executes JavaScript. |
| **Presets** | 32 editable composition templates across 12 categories, including 12 **Reels** templates: 5 neon/glass promo templates with sound design (a 15-second 6-scene Neon Promo, Glass Logo Reveal, Neon Search Bar, Floating Glass Icons, Planet Horizon Outro), and (kinetic-typography branding reels: an 18-second 7-scene reel, Bold Statement, Dark Quote, Product Showcase, Creator End Card, a Mongolian Cyrillic reel, Editorial Serif). You can apply, reset, duplicate, or save the current composition as a custom preset. A sample project loads on first launch, showing text animation, glow and a glitch transition. |
| **Audio** | Audio tracks on the timeline (move/trim, waveform), per-clip volume, fades, trim, mute. 21 procedurally generated sound effects (whooshes, hits, sub boom, pops, blips, typing, risers, shimmer, sparkle, logo reveal, glitch, ambient pads) synthesised on-device with Web Audio, so there are no samples and no licensing. Import MP3/M4A/WAV/AAC, or extract the soundtrack of any video (MP4/MOV) to MP3 CapCut-style (LAME encoder via lamejs). Download any clip as MP3. Preview playback stays in sync with the timeline clock. Export mixes everything offline and muxes AAC into MP4 (PCM in MOV when the device has no AAC encoder) or Opus into WebM. |
| **Background removal** | Picking or replacing a photo cuts the subject out automatically, using the U²-Net-p model (Apache-2.0, 4.6 MB) through onnxruntime-web (MIT) on WebAssembly. It runs entirely on the device, and you can restore the original. Turn it off with *Auto cut-out*. |
| **Projects** | Autosave and manual save to IndexedDB. New, rename, open, duplicate, delete. Import and export project JSON. Restore the sample project. Videos are never stored, only project data. |
| **Export** | Real video files: **WebCodecs** (frame-exact, H.264/HEVC → MP4, VP9/VP8/AV1 → WebM, via mediabunny) or **MediaRecorder** (real-time canvas capture, MP4 on Safari, WebM on Chrome/Firefox). Codecs are detected at runtime and the file extension always matches the real container. Choose resolution (**4K 2160×3840**, Full HD, 720p, 540p; 4K appears only when the device encoder accepts it), fps, duration and quality. Shows an in-sheet preview, then lets you share (iOS share sheet → *Save Video* to Photos) or download. Errors and dropped frames are reported, never hidden. |
| **Mobile** | Portrait-first layout with collapsible sections, bottom sheets, 40px+ touch targets and safe-area insets. 16px inputs stop iOS from zooming. Low/medium/high preview quality with adaptive particle density. On-canvas drag to move the selected layer. Recovers from WebGL context loss. Falls back to 2D-only rendering when WebGL2 is unavailable. Fullscreen / focus preview. Can be added to the home screen as a PWA. Keyboard shortcuts are optional extras (Space, ⌘Z, ⌘⇧Z, ⌘↵ in the editor). |

## How it renders

```
time t ──► resolve keyframes for every layer (pure function of t)
          │
          ▼
 accum ◄─ project background
 for each visible layer, bottom → top:
   2D layers (text/shape/image/bg/particles) → batched in an offscreen Canvas2D → uploaded → composited
   shader generators → temp target → composited with opacity + blend mode
   shader filters    → read accum as u_input → composited
 present accum
```

The preview, scrubbing and export all call the same `Renderer.render(project, t)`. A given time always produces the same frame. Particles and glitch noise are deterministic hashes of time and index, not simulations.

## Project structure

```
src/
  engine/            framework-free core (no React)
    types.ts         project / layer / keyframe types
    easing.ts        easing functions + cubic Bézier solver
    keyframes.ts     track evaluation, interpolation (numbers + colors), editing helpers
    text.ts          typography layout + 16 animation presets + cursor/light bar/sweep
    draw2d.ts        background, shapes, images, deterministic particles
    gl.ts            WebGL2 helpers, compile with parsed error lines, GLSL ES 3.00 prechecks
    shaderParams.ts  uniform annotation parser → UI controls
    shaders/library.ts  built-in GLSL effects
    renderer.ts      compositor (also the 2D fallback, masks, context-loss recovery)
    player.ts        single deterministic clock (rAF)
    exporter.ts      WebCodecs + MediaRecorder export, share/download
    storage.ts       IndexedDB (projects, shaders, presets) with in-memory fallback
    project.ts       layer factories, JSON normalisation for import
    templates.ts     20 templates + sample project
  state/             store (undo/redo, selection) + engine bridge
  ui/                React components (Preview, Timeline, Inspector, Layers, Templates, Code, Export, Projects)
tests/
  engine.test.ts     unit tests (vitest): easing, keyframes, text timing, shader parsing, templates, JSON round-trip
  harness.ts         in-browser engine checks: all shaders compile, error lines, masks, determinism, export
  app.mjs            end-to-end touch test of the real UI at iPhone size (26 assertions)
```

## Setup

Requires Node 20+.

```bash
cd motionforge
npm install
npm run dev        # http://localhost:5173, also on your LAN (--host) so you can open it on your iPhone
npm run build      # typecheck + production build into dist/
npm test           # unit tests
npm run test:e2e   # browser tests (needs a Chromium; set CHROMIUM_PATH)
```

To try it on your iPhone during development, put the phone on the same Wi-Fi and open the "Network" URL Vite prints. WebCodecs and sharing need a secure context (HTTPS), so for the full feature set use a deployed HTTPS build (below).

## Deploy for free

The build output in `dist/` is a static site that uses relative paths, so it works from any host or sub-folder.

- **Cloudflare Pages / Netlify / Vercel:** import the GitHub repo and set
  - root directory: `motionforge`
  - build command: `npm run build`
  - output directory: `dist`

  All three give you HTTPS on a free subdomain. Free-tier limits (build minutes, bandwidth) are far above what this app uses, because it has no backend and every render and export happens on your device.
- **GitHub Pages:** run `npm run build` and publish the contents of `motionforge/dist` (for example with a Pages Action that uploads that folder). Pages sites are public, even from a private repo on most plans.

Once deployed, open the URL in Safari, tap **Share → Add to Home Screen**, and it runs fullscreen like an app.

## iPhone Safari notes and limitations (honest list)

- **Export:** iOS 16.4+ Safari exposes WebCodecs `VideoEncoder` with H.264, which gives frame-exact MP4 that you can save to Photos from the share sheet. On older iOS only MediaRecorder is available: it records in real time, may drop frames on heavy compositions (the app reports how many), and produces MP4. If neither API exists, the export sheet says so instead of pretending.
- **Memory:** full-resolution 1080×1920 export holds the whole encoded file in memory. Long exports at high quality can exceed iOS tab limits on older devices. Use 720p or a shorter duration if the tab reloads.
- **Background:** iOS pauses background tabs. Keep the screen on during export.
- **Blur:** Canvas `filter` is not supported on every iOS version, so text and image blur use a shadow-based technique that renders identically everywhere. Full-frame blur uses the GLSL *Blur* filter.
- **Fullscreen:** iPhone Safari has no element fullscreen API. The ⤢ button uses an in-page focus mode instead (real fullscreen on iPad and desktop).
- **Fonts** are bundled (self-hosted woff2 from Fontsource, SIL Open Font License 1.1); only Latin and Cyrillic subsets are shipped and each file loads only when a text needs it. Export waits for every font (including Cyrillic subsets) before the first frame. Run `npm run fonts` after changing the font list.
- **Storage:** private browsing may block IndexedDB. The app then warns you and keeps projects in memory, so use *Export JSON* to keep your work.
- **4K** (2160 on the short side) is offered only with WebCodecs and only when the encoder reports 4K support for the chosen codec. It needs roughly 230 MB of GPU memory while rendering and produces large files, so keep 4K exports short (≤ 30 s) on phones; HEVC, when listed, gives smaller files. Exports are capped at 60 s in 4K.

## What was tested, and where

Automated tests ran in **headless Chromium** (software WebGL2 via SwiftShader) in a Linux container at a 390×844 touch viewport:

- 17 unit tests (easing, keyframe interpolation, text timing, shader parsing, templates, JSON round-trip)
- Browser engine harness: all 20 built-in shaders compile; a broken shader reports the correct line while the previous shader keeps rendering; keyframed position moves text; masks; determinism; all 20 templates render; WebCodecs (VP9/WebM, 45/45 frames) and MediaRecorder exports produce playable files
- 26 end-to-end UI assertions: playback, scrubbing, text editing, inspector keyframes, timeline keyframe tap/drag/easing, layer trim, undo/redo, shader errors and restore, custom shader uniforms, aspect switching, templates, custom presets, IndexedDB persistence across reload, and export through the UI

**Not yet verified on a physical iPhone.** The container has no Safari/WebKit. The code uses feature detection and Safari-compatible APIs throughout, but H.264 export, the share sheet and real-device performance need a check on an actual phone.

## Third-party runtime assets

- `public/models/u2netp.onnx` — U²-Net-p, Xuebin Qin et al., Apache-2.0 (ONNX export from the rembg project).
- `public/ort/` — copied from `onnxruntime-web` at build time (MIT).
- MP3 encoding — `@breezystack/lamejs` (LGPL-3.0, used unmodified as a library).

## Licenses

App code: original. Dependencies: React (MIT), CodeMirror 6 (MIT), mediabunny (MPL-2.0, used unmodified as a library), Vite/TypeScript (MIT/Apache-2.0, build-time only). Fonts are bundled from Fontsource under the SIL Open Font License 1.1.
