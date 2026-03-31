// ─────────────────────────────────────────────────────────────
// analyser.js — pure analysis pipeline (no DOM)
//
// Used by all three modes: single, gallery, compare.
// Returns a structured result object or throws.
// ─────────────────────────────────────────────────────────────
import { safeJSON } from './utils.js';
import { classifyImage } from './classifier.js';
import { computeScore }  from './scorer.js';

/**
 * Read a File as a base64 data URL.
 * @param {File} file
 * @returns {Promise<string>}
 */
export function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload  = e => resolve(e.target.result);
    fr.onerror = ()  => reject(new Error('FileReader failed'));
    fr.readAsDataURL(file);
  });
}

/**
 * Parse EXIF from a File using exifr.
 * @param {File} file
 * @param {object} Exifr — the exifr module (injected to avoid re-importing)
 * @returns {Promise<object>}
 */
export async function readExif(file, Exifr) {
  try {
    return await Exifr.parse(file, {
      tiff: true, exif: true, gps: true,
      iptc: false, icc: false, jfif: false,
      mergeOutput: true, translateKeys: true,
      translateValues: true, reviveValues: true,
    }) ?? {};
  } catch (e) {
    console.warn('[exifr]', e);
    return {};
  }
}

/**
 * Run the full C2PA + EXIF analysis pipeline on a single file.
 *
 * @param {File}   file    — the image File object
 * @param {object} sdk     — initialised c2pa-web SDK instance (or null)
 * @param {object} Exifr   — the exifr module
 * @returns {Promise<{
 *   file: File,
 *   dataURL: string,
 *   mfst: object|null,
 *   exif: object,
 *   cls: object,
 *   sr: object,
 *   error: string|null
 * }>}
 */
export async function analyseFile(file, sdk, Exifr) {
  const dataURL = await fileToDataURL(file);

  // Run EXIF and C2PA in parallel
  const [exif, mfstRaw] = await Promise.all([
    readExif(file, Exifr),
    _readManifest(file, sdk),
  ]);

  const mfst = mfstRaw.data;
  const error = mfstRaw.error;

  const cls = classifyImage(mfst, exif, file);
  const sr  = computeScore(mfst, exif, cls);

  if (error && !mfst) {
    sr.signals.unshift({ text: 'C2PA parse error: ' + error.slice(0, 100), status: 'neutral' });
  }

  return { file, dataURL, mfst, exif, cls, sr, error };
}

/** Internal: read the C2PA manifest store, guarded against WASM failures. */
async function _readManifest(file, sdk) {
  if (!sdk) return { data: null, error: 'SDK not available' };

  let reader = null;
  try {
    reader = await sdk.reader.fromBlob(file.type, file);
    if (!reader || typeof reader.manifestStore !== 'function') {
      return { data: null, error: null };
    }
    const raw  = await reader.manifestStore();
    let   data = raw ? safeJSON(raw) : null;
    // Empty manifest store → treat as no manifest
    if (data && (!data.manifests || Object.keys(data.manifests).length === 0)) {
      data = null;
    }
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e.message || String(e) };
  } finally {
    if (reader && typeof reader.free === 'function') {
      try { await reader.free(); } catch (_) {}
    }
  }
}
