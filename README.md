# C2PA Trust Analyzer

A browser-based image provenance and authenticity analyzer using the
[C2PA specification](https://c2pa.org/) and the official
[@contentauth/c2pa-web](https://www.npmjs.com/package/@contentauth/c2pa-web) SDK.

---

## Quick start

```bash
# From this directory:
python -m http.server 8000
```

Then open **http://localhost:8000** in your browser.

> A local HTTP server is required because the C2PA SDK uses WebAssembly,
> which cannot be loaded from `file://` URLs due to browser security policy.

---

## File structure

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
│   ├── scorer.js       computeScore()  → 0–100 + signal list
│   ├── emblem.js       makeEmblem()    → inline SVG
│   ├── renderer.js     buildReasonBullets(), buildDetailSections(), renderReport()
│   └── app.js          SDK bootstrap, EXIF reader, UI controller (entry point)
└── README.md
```

All JS files use native ES modules (`export`/`import`). No build step, no bundler,
no `node_modules`. `index.html` loads only `app.js`; all other modules are
imported transitively.

---

## Architecture

```
File (drop/click)
    ├── FileReader          → base64 data URL  (image preview)
    ├── exifr.parse()       → plain EXIF object (Tier 2 metadata)
    └── c2pa-web SDK (WASM)
            └── reader.fromBlob() → manifestStore → safeJSON()

                    ↓
            classifyImage()   →  { tier, verdict, … }
            computeScore()    →  { score, signals }
            buildReasonBullets()
            buildDetailSections()
            makeEmblem()
            renderReport()    →  DOM injection into #report
```

### Three-tier classification

| Tier | Condition | Emblem |
|------|-----------|--------|
| 1 | C2PA manifest present | Shield (green/amber/red/purple) |
| 2 | No C2PA but EXIF present | Camera (blue/amber) |
| 3 | No provenance at all | Circle + ? (grey) |

---

## Dependencies (all CDN, no install)

| Package | Version | Purpose |
|---------|---------|---------|
| `@contentauth/c2pa-web/inline` | 0.6.1 | C2PA WASM SDK (inline variant — WASM baked as base64) |
| `exifr` | 7.1.3 | EXIF/GPS/TIFF metadata reader |
| Google Fonts | — | Space Mono + DM Sans |

---

## Notes

- **Trust list**: `c2pa-web@0.6.1` bundles the updated CAI trust list.
  Most major production signers (Google, Adobe, etc.) are now covered.
  Images signed by Google Gemini will show as **Tier 1 — AI-generated (verified)**.

- **`signingCredential.untrusted`**: If this appears, it means the signing
  certificate is not in the SDK's bundled trust anchors. The signature itself
  may still be mathematically valid (check for `claimSignature.validated` in
  the validation results panel).

- **Screenshots and web exports** route to Tier 3 (no provenance). This is
  expected behaviour — absence of C2PA data is not evidence of manipulation.

---

#### **Limitations**

###### The trust list problem is not fully solved. 

signingCredential.untrusted fires for Google, Adobe, and most major signers because the WASM bundles the old Interim Trust List. We've fixed the messaging to be honest about this, but c2pa\_verified (the green shield) will almost never appear in practice until the SDK ships an updated trust bundle. Most real-world C2PA images will land on c2pa\_signed\_untrusted (amber) regardless of their actual validity.

###### 

###### No network access means no live trust list checking. 

The official trust anchors at contentcredentials.org/trust/anchors.pem are a fetchable PEM file, but the c2pa-web SDK's inline variant has no public API to inject custom trust anchors. You'd need either a newer SDK version that bundles the updated list, or a server-side verification endpoint.



###### file:// protocol still doesn't work. 

The WASM module and ESM import chain require HTTP headers (Content-Type: application/wasm, CORS). Users must run a local server. This is a real friction point for non-developers.



###### The inline WASM approach has a size cost. 

The /inline variant bakes \~3–5 MB of base64-encoded WASM into the JavaScript. This loads fine on a local server but would be slow on a hosted page without caching.



###### Single-file architecture hits a ceiling. At 1,280 lines it's already dense. 

Adding features requires careful surgical edits and manual brace-counting. There's no separation of concerns — styling, logic, templates, and data all live in one blob.



###### The scoring model is ad hoc. 

The 0–100 score for Tier 1 is an invented weighting system, not one derived from the C2PA spec or any recognised methodology. A score of 68 vs 72 carries no meaningful distinction. For a trust system this matters — users may anchor on the number when they should be reading the verdict label.

---

#### **Lacking**



###### No batch/repository mode. 

The brief was an "image repository" viewer. Currently it analyses one image at a time. There's no way to load a folder, see a gallery of emblems, or filter by verdict.



###### No image comparison. 

Uploading the same image twice produces the same result with no way to compare two versions side-by-side or detect drift between them.



###### No persistent history. 

Results disappear on reset. There's no way to save a report to the browser's local storage or export a set of reports as a ZIP.



###### No C2PA writing/signing. 

The site only reads. The brief for Part B was an "emblem device automatically generated from the Trust Report to be displayed adjacent to the image." The emblem exists, but it's not embeddable — there's no way to download the image with the emblem attached, or to generate a C2PA-signed version.



###### The emblem is not adjacent to the image in a repository context. 

Right now the emblem is a result view after analysis. The original vision was the emblem sitting next to each image thumbnail in a browsable gallery — so viewers glancing at many images get instant trust signals without clicking into each one.



###### No Trust Profile configuration. 

The brief explicitly mentioned "individualised Trust Profiles." There's a scoring system but no user-facing way to switch profiles (journalism vs stock photography vs archival), adjust weights, or set thresholds.



###### No server-side validation. 

For a production system you'd want a backend that runs c2patool (the Rust CLI) directly, which uses the live trust list and produces spec-compliant validation output rather than relying on the bundled WASM.



###### No IPTC / XMP fallback parsing. 

Some cameras and workflows embed provenance in XMP rather than C2PA. Adobe products, for example, write dc:creator, xmpMM:History, and xmpRights:WebStatement fields that the site currently ignores.

