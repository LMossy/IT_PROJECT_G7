# C2PA Trust Analyser

A browser-based image provenance and authenticity analyzer using the
[C2PA specification](https://spec.c2pa.org/specifications/specifications/2.3/specs/C2PA_Specification.html) and the official
[@contentauth/c2pa-web](https://www.npmjs.com/package/@contentauth/c2pa-web) SDK.

---

## Quick Start

```bash
# From this directory:
python -m http.server 8000
```

Then open **http://localhost:8000** in your browser.

> A local HTTP server is required because the C2PA SDK uses WebAssembly,
> which cannot be loaded from `file://` URLs due to browser security policy.

---

## File Structure

```
c2pa-trust-analyzer/
├── index.html          HTML shell — layout, emblem guide, loads app.js
├── css/
│   └── style.css       All styles (CSS custom properties, light theme)
├── js/
│   ├── data.js         Lookup tables: DST, ACTIONS, VSTATUS, EDIT_SW
│   ├── utils.js        Pure utilities: esc(), delay(), dr(), safeJSON()
│   ├── helpers.js      C2PA manifest accessors (snake_case SDK structure)
│   ├── classifier.js   classifyImage() → tier + verdict
│   ├── scorer.js       computeScore()  → evidence + signals
│   ├── emblem.js       makeEmblem()    → inline SVG
│   ├── renderer.js     buildReasonBullets(), buildDetailSections(), renderReport()
│   └── app.js          SDK bootstrap, EXIF reader, UI controller (entry point)
├── tests/
│   ├── node_modules/       
│   │   └── ...             All the supporting modules for npm
│   ├── setup/              Babel preset for ES module transformation
│   │   ├── babel.config.cjs
│   │   ├── jest.config.cjs
│   │   ├── jest.config.js
│   │   ├── jest.setup.js
│   │   ├── package.json
│   │   ├── package-lock.json
│   │   └── setup.cjs
│   ├── jest.setup.js       Test environment mocks (FileReader, File, DOM)
│   ├── jest.config.js      Jest configuration for ES modules
│   ├── package.json        Test dependencies (Jest, jsdom, babel)
│   ├── test-analyser.js
│   ├── test-app.js
│   ├── test-classifier.js
│   ├── test-emblem.js
│   ├── test-helpers.js
│   ├── test-renderer.js
│   ├── test-scorer.js
│   └── test-utils.js
└── README.md
```

All JS files use native ES modules (`export`/`import`). No build step, no bundler.
`index.html` loads only `app.js`; all other modules are imported transitively.

---

## Architecture

```
File (drop/click)
    ├── FileReader          → base64 data URL  (image preview)
    ├── exifr.parse()       → plain EXIF object (Tier 2 metadata)
    └── c2pa-web SDK (WASM)
            └── reader.fromBlob() → manifestStore → safeJSON()

                    ↓
            classifyImage()   →  { tier, verdict, colorClass }
            computeScore()    →  { evidence[], signals[] }
            buildReasonBullets()
            buildDetailSections()
            makeEmblem()
            renderReport()    →  DOM injection into #report
```

### Three-Tier Classification

| Tier | Condition | Emblem | Color |
|------|-----------|--------|-------|
| 1 | C2PA manifest present | Shield | Green/Amber/Red/Purple |
| 2 | No C2PA but EXIF present | Camera | Blue/Amber |
| 3 | No provenance at all | Circle + ? | Grey |

### Classification Verdicts

| Verdict | Tier | Meaning |
|---------|------|---------|
| `c2pa_verified` | 1 | Cryptographically verified signature |
| `c2pa_signed_untrusted` | 1 | Valid signature, cert not in trust list |
| `c2pa_ai_declared` | 1 | AI-generated (declared in C2PA) |
| `c2pa_tampered` | 1 | Manifest present, signature failed |
| `c2pa_manifest` | 1 | Manifest present, unverified |
| `exif_camera` | 2 | Camera metadata present |
| `exif_edited` | 2 | Editing software detected |
| `exif_partial` | 2 | Partial EXIF metadata |
| `no_provenance` | 3 | No C2PA or EXIF data |

---

## Dependencies

### Runtime (all CDN, no install)

| Package | Version | Purpose |
|---------|---------|---------|
| `@contentauth/c2pa-web/inline` | 0.6.1 | C2PA WASM SDK (inline variant) |
| `exifr` | 7.1.3 | EXIF/GPS/TIFF metadata reader |
| Google Fonts | — | Space Mono + DM Sans |

### Development (for testing)

| Package | Version | Purpose |
|---------|---------|---------|
| `jest` | 29.5.0 | Testing framework |
| `jest-environment-jsdom` | 29.5.0 | DOM simulation for tests |
| `babel-jest` | 29.5.0 | ES module transformation |
| `@babel/core` | 7.21.0 | Babel compiler |
| `@babel/preset-env` | 7.21.0 | JavaScript preset |

---

## Testing

Run the test suite:

```bash
npm install
npm test
```

### Test Coverage

| Module | Test File | Status |
|--------|-----------|--------|
| analyser.js | test-analyser.js | Passing |
| app.js | test-app.js | Passing |
| classifier.js | test-classifier.js | Passing |
| emblem.js | test-emblem.js | Passing |
| helpers.js | test-helpers.js | Passing |
| renderer.js | test-renderer.js | Passing |
| scorer.js | test-scorer.js | Passing |
| utils.js | test-utils.js | Passing |

**Total:** 8 test suites | 26 tests | All passing 

---

## Technical Notes

### Trust List Behavior

The `c2pa-web@0.6.1` SDK bundles the CAI trust list. Most major production signers
(Google, Adobe, etc.) are covered. Images signed by Google Gemini will show as
**Tier 1 — AI-generated (verified)**.

### Understanding `signingCredential.untrusted`

If this status appears, it means the signing certificate is not in the SDK's bundled
trust anchors. The signature itself may still be mathematically valid — check for
`claimSignature.validated` in the validation results panel to confirm.

### Screenshots and Web Exports

Images without C2PA or EXIF metadata route to Tier 3 (no provenance). This is
expected behaviour — absence of provenance data is not evidence of manipulation.
Many legitimate images (screenshots, web exports, social media downloads) carry
no metadata.

### File Type Support

The analyzer supports the following image formats:
- JPEG/JPG
- PNG
- WebP
- TIFF
- AVIF

---

## License

This project is developed for educational purposes as part of UNSW Canberra's ZEIT 3118 Project Assignment. All C2PA-related trademarks belong to the Coalition for Content Provenance and Authenticity.

---
