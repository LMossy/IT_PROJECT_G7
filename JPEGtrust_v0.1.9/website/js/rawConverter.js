// ─────────────────────────────────────────────────────────────
// rawConverter.js — raw / phone photo format detection & conversion
//
// Phone raw formats supported:
//   HEIC / HEIF  — iOS default (since iOS 11); some Android OEMs
//   DNG          — Android (Pixel, Samsung pro-mode, OnePlus, etc.)
//                  iOS via Halide, ProCamera, Adobe Lightroom Mobile
//   ARW          — Sony Xperia
//   NEF          — Nikon (rare on phones)
//   CR2 / CR3    — Canon (rare on phones)
//   RAF          — Fujifilm (rare on phones)
//   RW2          — Panasonic (rare on phones)
//   ORF          — Olympus (rare on phones)
//   PEF          — Pentax (rare on phones)
//
// HEIC/HEIF → converted to JPEG via heic2any (loaded from esm.sh CDN)
// DNG → embedded JPEG preview extracted via exifr.thumbnail()
// Other raw → read as-is; browser renders if natively supported
// ─────────────────────────────────────────────────────────────

/** Extension → format metadata */
const RAW_FORMATS = {
  heic: { label: 'HEIC',             mime: 'image/heic',            lossless: false, needsConversion: true  },
  heif: { label: 'HEIF',             mime: 'image/heif',            lossless: false, needsConversion: true  },
  dng:  { label: 'DNG',              mime: 'image/dng',             lossless: true,  needsConversion: false },
  arw:  { label: 'ARW (Sony)',        mime: 'image/x-sony-arw',      lossless: true,  needsConversion: false },
  nef:  { label: 'NEF (Nikon)',       mime: 'image/x-nikon-nef',     lossless: true,  needsConversion: false },
  cr2:  { label: 'CR2 (Canon)',       mime: 'image/x-canon-cr2',     lossless: true,  needsConversion: false },
  cr3:  { label: 'CR3 (Canon)',       mime: 'image/x-canon-cr3',     lossless: true,  needsConversion: false },
  raf:  { label: 'RAF (Fujifilm)',    mime: 'image/x-fujifilm-raf',  lossless: true,  needsConversion: false },
  rw2:  { label: 'RW2 (Panasonic)',  mime: 'image/x-panasonic-rw2', lossless: true,  needsConversion: false },
  orf:  { label: 'ORF (Olympus)',     mime: 'image/x-olympus-orf',   lossless: true,  needsConversion: false },
  pef:  { label: 'PEF (Pentax)',      mime: 'image/x-pentax-pef',    lossless: true,  needsConversion: false },
  sr2:  { label: 'SR2 (Sony)',        mime: 'image/x-sony-sr2',      lossless: true,  needsConversion: false },
  raw:  { label: 'RAW',              mime: 'image/x-raw',           lossless: true,  needsConversion: false },
};

/** MIME types browsers may report for HEIC files */
const HEIC_MIMES = new Set([
  'image/heic', 'image/heif',
  'image/heic-sequence', 'image/heif-sequence',
]);

// Lazy-load state for heic2any
let _heic2anyCache = null;
let _heic2anyAttempted = false;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Lowercase extension from a filename (e.g. "photo.DNG" → "dng").
 * @param {string} filename
 * @returns {string}
 */
export function getExtension(filename) {
  return String(filename || '').split('.').pop().toLowerCase();
}

/**
 * Return raw-format metadata for a File, or null if it is a standard format.
 * Detects by extension first, then by MIME type (for HEIC reported by browser).
 * @param {File} file
 * @returns {{ ext: string, label: string, mime: string, lossless: boolean, needsConversion: boolean }|null}
 */
export function getRawInfo(file) {
  const ext = getExtension(file.name);
  if (RAW_FORMATS[ext]) return { ext, ...RAW_FORMATS[ext] };
  const mime = (file.type || '').toLowerCase();
  if (HEIC_MIMES.has(mime)) return { ext: 'heic', ...RAW_FORMATS.heic };
  return null;
}

/**
 * Is this file a raw / phone-photo format?
 * @param {File} file
 * @returns {boolean}
 */
export function isRawFormat(file) {
  return getRawInfo(file) !== null;
}

/**
 * Effective MIME type for a file.
 * When the browser leaves file.type empty (common for raw files),
 * the MIME is inferred from the extension.
 * @param {File} file
 * @returns {string}
 */
export function getEffectiveMimeType(file) {
  if (file.type) return file.type;
  const info = getRawInfo(file);
  return info ? info.mime : '';
}

/**
 * Get the best displayable data URL for any file, including raw formats.
 *
 * ┌────────────┬──────────────────────────────────────────────────────────────┐
 * │ Format     │ Strategy                                                     │
 * ├────────────┼──────────────────────────────────────────────────────────────┤
 * │ HEIC/HEIF  │ Convert to JPEG via heic2any (CDN). Falls back to raw        │
 * │            │ data URL — Safari on macOS/iOS renders HEIC natively.        │
 * ├────────────┼──────────────────────────────────────────────────────────────┤
 * │ DNG        │ Extract embedded JPEG preview via exifr.thumbnail(). Falls   │
 * │            │ back to raw data URL (browser renders if it can).            │
 * ├────────────┼──────────────────────────────────────────────────────────────┤
 * │ ARW / NEF  │ Extract embedded JPEG preview via exifr.thumbnail(). Falls   │
 * │ CR2 / etc. │ back to raw data URL.                                        │
 * ├────────────┼──────────────────────────────────────────────────────────────┤
 * │ Standard   │ Plain FileReader data URL (existing behaviour).              │
 * └────────────┴──────────────────────────────────────────────────────────────┘
 *
 * @param {File}        file
 * @param {object|null} Exifr  — exifr module instance (needed for DNG preview)
 * @returns {Promise<{
 *   dataURL:       string,
 *   displayMime:   string,
 *   rawInfo:       object|null,
 *   previewSource: 'converted'|'embedded_preview'|'native'|'original'
 * }>}
 */
export async function getDisplayableDataURL(file, Exifr = null) {
  const rawInfo = getRawInfo(file);

  // ── Standard format ───────────────────────────────────────────────────────
  if (!rawInfo) {
    const dataURL = await _fileToDataURL(file);
    return { dataURL, displayMime: file.type, rawInfo: null, previewSource: 'original' };
  }

  // ── HEIC / HEIF ───────────────────────────────────────────────────────────
  if (rawInfo.needsConversion) {
    const jpeg = await _convertHeicToJpeg(file);
    if (jpeg) {
      return { dataURL: jpeg, displayMime: 'image/jpeg', rawInfo, previewSource: 'converted' };
    }
    // Fallback: raw data URL (Safari renders HEIC natively)
    const dataURL = await _fileToDataURL(file);
    return { dataURL, displayMime: rawInfo.mime, rawInfo, previewSource: 'native' };
  }

  // ── DNG and other raw formats ─────────────────────────────────────────────
  // Try embedded JPEG preview first (most phone DNG/ARW files contain one)
  if (Exifr) {
    try {
      const previewBlob = await Exifr.thumbnail(file);
      if (previewBlob && previewBlob.size > 0) {
        const previewURL = await _blobToDataURL(previewBlob);
        return { dataURL: previewURL, displayMime: 'image/jpeg', rawInfo, previewSource: 'embedded_preview' };
      }
    } catch (_) {
      // thumbnail extraction failed — fall through to raw data URL
    }
  }

  // Last resort: read raw bytes as-is (will only render in browsers that support the format)
  const dataURL = await _fileToDataURL(file);
  return { dataURL, displayMime: rawInfo.mime, rawInfo, previewSource: 'original' };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Lazy-load heic2any from esm.sh CDN (converts HEIC→JPEG client-side via libheif WASM).
 * Returns null if loading fails (e.g. offline / blocked).
 */
async function _loadHeic2Any() {
  if (_heic2anyAttempted) return _heic2anyCache;
  _heic2anyAttempted = true;
  try {
    const mod = await import('https://esm.sh/heic2any@0.0.4');
    _heic2anyCache = mod.default || mod;
  } catch (e) {
    console.warn('[rawConverter] heic2any load failed:', e);
    _heic2anyCache = null;
  }
  return _heic2anyCache;
}

/** Convert a HEIC/HEIF File to a JPEG data URL. Returns null on failure. */
async function _convertHeicToJpeg(file) {
  const heic2any = await _loadHeic2Any();
  if (!heic2any) return null;
  try {
    const result = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    const blob = Array.isArray(result) ? result[0] : result;
    return await _blobToDataURL(blob);
  } catch (e) {
    console.warn('[rawConverter] HEIC→JPEG conversion failed:', e);
    return null;
  }
}

/** Read a File as a base64 data URL. */
function _fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload  = e => resolve(e.target.result);
    fr.onerror = () => reject(new Error('FileReader failed'));
    fr.readAsDataURL(file);
  });
}

/** Read a Blob as a base64 data URL. */
function _blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload  = e => resolve(e.target.result);
    fr.onerror = () => reject(new Error('Blob→DataURL failed'));
    fr.readAsDataURL(blob);
  });
}
