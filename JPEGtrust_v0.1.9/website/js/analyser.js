// ─────────────────────────────────────────────────────────────
// analyser.js — pure analysis pipeline (no DOM)
//
// Simplified Flow:
//   1. Convert/preview raw file if needed (HEIC→JPEG, DNG embedded preview)
//   2. Run EXIF + C2PA in parallel on the original file
//   3. Evaluate + score + run pixel forensics
//   4. Return structured result
// ─────────────────────────────────────────────────────────────
import { safeJSON } from "./utils.js";
import { evaluateImage } from "./classifier.js";
import { computeScore } from "./scorer.js";
import { runForensics } from "./forensics.js";
import { getDisplayableDataURL, getEffectiveMimeType } from "./rawConverter.js";

/**
 * Read a File as a base64 data URL.
 * For HEIC/raw formats use getDisplayableDataURL() instead.
 * @param {File} file
 * @returns {Promise<string>}
 */
export function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = (e) => resolve(e.target.result);
    fr.onerror = () => reject(new Error("FileReader failed"));
    fr.readAsDataURL(file);
  });
}

/**
 * Parse EXIF from a File using exifr.
 * Works on JPEG, PNG, WebP, TIFF, AVIF, HEIC, DNG, ARW, NEF, and most raw formats.
 * @param {File}   file
 * @param {object} Exifr — the exifr module (injected to avoid re-importing)
 * @returns {Promise<object>}
 */
export async function readExif(file, Exifr) {
  try {
    return (
      (await Exifr.parse(file, {
        tiff: true,
        exif: true,
        xmp: true,
        gps: true,
        iptc: true,
        icc: false,
        jfif: false,
        mergeOutput: true,
        translateKeys: true,
        translateValues: true,
        reviveValues: true,
      })) ?? {}
    );
  } catch (e) {
    console.warn("[exifr]", e);
    return {};
  }
}

/**
 * Run the full C2PA + EXIF analysis pipeline on a single file.
 * Handles raw/phone formats (HEIC, DNG, ARW, NEF, etc.) transparently.
 *
 * @param {File}   file    — the image File object
 * @param {object} sdk     — initialised c2pa-web SDK instance (or null)
 * @param {object} Exifr   — the exifr module
 * @returns {Promise<{
 *   file:          File,
 *   dataURL:       string,
 *   rawInfo:       object|null,
 *   previewSource: string,
 *   mfst:          object|null,
 *   exif:          object,
 *   evalResult:    object,
 *   sr:            object,
 *   forensics:     object,
 *   error:         string|null
 * }>}
 */
export async function analyseFile(file, sdk, Exifr) {
  // Step 1 — get best displayable URL (converts HEIC, extracts DNG preview, etc.)
  const { dataURL, displayMime, rawInfo, previewSource } =
    await getDisplayableDataURL(file, Exifr);

  // Effective MIME type for C2PA (inferred from extension when browser leaves it empty)
  const effectiveMime = getEffectiveMimeType(file);

  // Step 2 — run EXIF and C2PA in parallel (always on the original file)
  const [exif, mfstRaw] = await Promise.all([
    readExif(file, Exifr),
    _readManifest(file, sdk, effectiveMime),
  ]);

  const mfst = mfstRaw.data;
  const error = mfstRaw.error;

  // Step 3 — multi-dimensional trust evaluation
  const evalResult = evaluateImage(mfst, exif, file);

  // Step 4 — scoring and pixel forensics in parallel
  // Pass displayMime so forensics knows whether the preview is lossless/lossy,
  // and pass rawInfo so forensics can label raw sources correctly.
  const [sr, forensics] = await Promise.all([
    computeScore(file, sdk, Exifr),
    runForensics(dataURL, displayMime || effectiveMime || file.type, rawInfo),
  ]);

  if (error && !mfst) {
    if (sr && sr.signals) {
      sr.signals.unshift({
        text: "C2PA parse error: " + error.slice(0, 100),
        status: "neutral",
      });
    }
  }

  return {
    file,
    dataURL,
    rawInfo,
    previewSource,
    mfst,
    exif,
    evalResult,
    sr,
    forensics,
    error,
  };
}

/**
 * Internal: read the C2PA manifest store, guarded against WASM failures.
 * @param {File}   file
 * @param {object} sdk
 * @param {string} effectiveMime — MIME type (inferred from extension when empty)
 */
async function _readManifest(file, sdk, effectiveMime) {
  if (!sdk) return { data: null, error: "SDK not available" };

  // Use effective MIME so the SDK can identify the container format.
  // Fall back to a generic octet-stream rather than an empty string.
  const mimeToUse = effectiveMime || file.type || "application/octet-stream";

  let reader = null;
  try {
    reader = await sdk.reader.fromBlob(mimeToUse, file);
    if (!reader || typeof reader.manifestStore !== "function") {
      return { data: null, error: null };
    }
    const raw = await reader.manifestStore();
    let data = raw ? safeJSON(raw) : null;
    // Empty manifest store → treat as no manifest
    if (data && (!data.manifests || Object.keys(data.manifests).length === 0)) {
      data = null;
    }
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e.message || String(e) };
  } finally {
    if (reader && typeof reader.free === "function") {
      try {
        await reader.free();
      } catch (_) {}
    }
  }
}
