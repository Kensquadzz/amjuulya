Third-party browser libraries used only by the admin upload screen (loaded on demand):

| File | Package | Version | License |
| --- | --- | --- | --- |
| `mediabunny.js` | [mediabunny](https://github.com/Vanilagy/mediabunny) (`dist/bundles/mediabunny.min.mjs`) | 1.61.6 | MPL-2.0 |
| `mediabunny-aac-encoder.js` | [@mediabunny/aac-encoder](https://github.com/Vanilagy/mediabunny) (`dist/bundles/mediabunny-aac-encoder.min.mjs`, import specifier changed to `./mediabunny.js`) | 1.61.6 | MPL-2.0 |
| `heic-to.js` | [heic-to](https://github.com/hoppergee/heic-to) (`dist/csp/heic-to.min.js`, wraps libheif) | 1.6.6 | LGPL-3.0 |

Files are unmodified apart from the noted import path. Source code: see the linked repositories / npm packages.
| `utif.js` | [UTIF.js](https://github.com/photopea/UTIF.js) (`utif2` 4.1.0) + [pako](https://github.com/nodeca/pako) inflate 1.0.11, concatenated with an `export default` line | 4.1.0 / 1.0.11 | MIT |
| `vercel-blob-client.js` | [@vercel/blob](https://github.com/vercel/storage) `client` (`put`, `uploadPresigned`), bundled for the browser with esbuild | 2.8.0 | Apache-2.0 |
