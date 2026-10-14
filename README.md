# amjuulya

AMJUULYA - Mongolian gig economy platform website.

## Bibi — Mongolian ⇄ English voice AI (`/learn.html`)

A mobile-first page where users speak or type in Mongolian or English and get either a
**translation** (with context notes) or a **conversation partner** for English practice
(gentle corrections + "repeat after me").

### Architecture

| Path | What |
|---|---|
| `learn.html`, `assets/learn.css`, `assets/learn.js` | UI (plain HTML/JS, no build step — same as the rest of the site) |
| `assets/learn-speech.js` | Browser speech layer: recorder with silence detection, Web Speech fallback, single-track audio player |
| `api/learn/chat.js` | `POST` — AI reply (translate / conversation / clarify) as structured JSON |
| `api/learn/stt.js` | `POST` — speech → text (audio is forwarded to the provider, never stored or logged) |
| `api/learn/tts.js` | `POST` — text → `audio/mpeg` |
| `api/learn/config.js` | `GET` — which features are configured (booleans only, no secrets) |
| `api/_lib/*` | Provider abstraction (LLM, STT, TTS), validation, rate limiting, duplicate-request guard, secret-safe logging |

Files under `api/_lib` start with `_`, so Vercel does not expose them as endpoints.

### Providers (all server-side, all replaceable)

- **Language model:** Anthropic Claude via the official `@anthropic-ai/sdk` (`ANTHROPIC_API_KEY`, already used by the
  Messenger bot). Default model `claude-opus-5-5` at low effort for voice latency, with server-side refusal fallback.
  Override with `LEARN_ANTHROPIC_MODEL`.
- **Speech-to-text:** ElevenLabs Scribe (lists Mongolian among its supported languages) or OpenAI transcription.
  If none is configured, the page falls back to the browser's Web Speech API (Chrome/Edge/Safari). Mongolian support
  there depends on the browser, and an unsupported language shows a clear message.
- **Text-to-speech:** Azure Neural TTS (official `mn-MN` voices), ElevenLabs (set a Mongolian voice ID), or OpenAI
  (English only by default). If none is configured for a language, the play button uses a device voice when one
  exists for that language, otherwise it is disabled and says why.

Mongolian voice quality differs a lot between providers, so pick one per language:
`TTS_PROVIDER_MN=azure`, `TTS_PROVIDER_EN=elevenlabs`, and so on. See `.env.example` for every variable.

### Run locally

```bash
npm install
cp .env.example .env.local     # fill in at least ANTHROPIC_API_KEY
npm run dev                    # http://localhost:3000/learn.html
```

The microphone needs a secure context (`localhost` or HTTPS).

### Tests

```bash
npm test          # unit + integration (validation, rate limit, dedupe, Claude SDK against a mock API, STT/TTS adapters)
npm run test:e2e  # Chromium mobile viewport with a fake microphone; AI/STT/TTS mocked at the network layer
```

### Deploy (Vercel)

Add the environment variables under Project → Settings → Environment Variables and redeploy. Vercel installs
`package.json` dependencies automatically. Set `UPSTASH_REDIS_REST_URL`/`TOKEN` so rate limits and the duplicate
check are shared across serverless instances. Without them, each instance keeps its own in-memory limits.
