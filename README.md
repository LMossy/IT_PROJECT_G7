# JPEGTrust

JPEGTrust is a browser-based image provenance and authenticity analyser. It checks uploaded images for C2PA manifests, EXIF/XMP/IPTC metadata, declared edits, AI-origin signals, raw/phone-photo format details, and pixel-level forensic indicators.

The app runs locally in the browser. Image files are analysed client-side and are not uploaded to a server.

## Quick Start

From this directory:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

A local HTTP server is required because the C2PA WebAssembly SDK cannot be loaded from `file://` URLs under normal browser security rules.

## Features

- Single-image analysis with drag-and-drop upload.
- Gallery mode for batch processing a folder of images.
- C2PA manifest detection and signature/trust evaluation.
- EXIF, XMP, GPS, IPTC, TIFF, and camera metadata parsing.
- Authenticity score from 0 to 100 based on provenance, metadata, signature, and consistency signals.
- Detection of disclosed edits, AI generation claims, editing software, and metadata contradictions.
- Pixel-level forensic checks including ELA, clone/copy indicators, noise consistency, and AI-likelihood signals.
- Raw and phone-photo support, including HEIC/HEIF conversion and embedded preview extraction for DNG/raw formats.

## File Structure

```text
website/
|-- index.html              App shell, upload UI, mode toggle, report containers
|-- css/
|   `-- style.css           Application styling
|-- js/
|   |-- app.js              Browser entry point, SDK bootstrap, single-image UI
|   |-- analyser.js         Main analysis pipeline for one file
|   |-- classifier.js       Multi-dimensional trust judgement framework
|   |-- scorer.js           Evidence rows, audit signals, checks, score
|   |-- renderer.js         Trust report rendering
|   |-- gallery.js          Batch folder analysis and comparison view
|   |-- rawConverter.js     HEIC/raw detection, conversion, preview handling
|   |-- forensics.js        Pixel-level forensic analysis
|   |-- helpers.js          C2PA manifest helper accessors
|   |-- data.js             Lookup tables for actions, data sources, editors
|   |-- emblem.js           Trust emblem generation
|   `-- utils.js            Shared utility functions
`-- testing/
    |-- package.json        Jest test scripts and dev dependencies
    |-- jest.config.js      Jest configuration
    |-- babel.config.cjs    Babel configuration for ES modules
    |-- jest.setup.js       Browser and DOM test mocks
    `-- tests/              Unit tests for the analysis modules
```

All browser code uses native ES modules. There is no build step and no bundler.

## How It Works

```text
Image upload or folder selection
        |
        |-- getDisplayableDataURL()
        |      Converts HEIC when possible and extracts embedded raw previews
        |
        |-- exifr.parse()
        |      Reads EXIF, XMP, GPS, IPTC, and TIFF metadata
        |
        |-- c2pa-web SDK
        |      Reads manifest store and validation data
        |
        |-- evaluateImage()
        |      Produces provenance status, edit status, metadata status,
        |      final trust judgement, and authenticity score
        |
        |-- computeScore() and runForensics()
        |      Builds evidence, checks, audit signals, and pixel indicators
        |
        |-- renderReport()
               Displays the trust report and emblem
```

## Trust Judgements

JPEGTrust separates provenance, content/edit status, and metadata support before producing a final judgement.

| Judgement | Meaning |
| --- | --- |
| `strong_provenance` | Verified C2PA provenance, original/camera capture, and consistent metadata. |
| `verified_with_disclosed_edits` | Verified C2PA provenance with transparent edits or declared AI generation. |
| `provisionally_signed` | Signature is valid and content appears intact, but the certificate is not in the SDK trust store. |
| `limited_evidence` | No C2PA manifest, but useful camera metadata is present. |
| `inconsistent_or_suspicious` | Provenance exists, but metadata or other signals require review. |
| `tampered` | C2PA content hash mismatch indicates the image changed after signing. |
| `invalid_provenance` | Signature validation failed or the signing certificate is revoked. |
| `insufficient_evidence` | No useful C2PA or metadata evidence was found. |

## Supported Formats

Standard image formats:

- JPEG/JPG
- PNG
- WebP
- TIFF
- AVIF

Phone and raw formats:

- HEIC/HEIF
- DNG
- ARW
- NEF
- CR2/CR3
- RAF
- RW2
- ORF
- PEF
- SR2
- RAW

Browser support varies for raw and HEIC display. JPEGTrust attempts to convert HEIC/HEIF through `heic2any` and extract embedded JPEG previews from DNG/raw files with `exifr.thumbnail()`.

## Dependencies

Runtime dependencies are loaded from CDNs in the browser:

| Package | Version | Purpose |
| --- | --- | --- |
| `@contentauth/c2pa-web/inline` | 0.6.1 | C2PA WebAssembly SDK |
| `exifr` | 7.1.3 | EXIF/XMP/IPTC/GPS metadata parser |
| `heic2any` | 0.0.4 | Lazy-loaded HEIC/HEIF to JPEG conversion |
| Google Fonts | - | Space Mono and DM Sans |

Development dependencies live in `testing/package.json` and are used only for the Jest test suite.

## Testing

Run tests from the `testing` directory:

```bash
cd testing
npm install
npm test
```

Useful scripts:

```bash
npm test
npm run test:watch
npm run test:coverage
```

The test suite covers the analyser, classifier, scorer, renderer, helpers, emblem, utilities, and app wiring.

## Technical Notes

### C2PA Trust Store

The app uses `@contentauth/c2pa-web@0.6.1`, which includes the SDK trust behaviour available in that version. A valid signature can still appear as an unverified certificate if the signer is not in the SDK trust store.

### Missing Provenance

An image with no C2PA manifest and no useful EXIF metadata is classified as insufficient evidence. This does not prove manipulation. Screenshots, social media downloads, messaging-app exports, and many web images often strip metadata.

### Forensic Signals

Pixel-level checks are probabilistic indicators, not proof. They are shown as supporting signals alongside C2PA and metadata evidence.

### Privacy

Analysis runs in the browser. The local HTTP server only serves the static files in this folder.

## License
placeholder
