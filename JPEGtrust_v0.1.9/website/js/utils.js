// ─────────────────────────────────────────────────────────────
// utils.js — pure utility functions shared across all modules
// ─────────────────────────────────────────────────────────────

/** HTML-escape a value for safe innerHTML injection */
export const esc = s =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Promise-based delay (ms) */
export const delay = ms => new Promise(r => setTimeout(r, ms));

/**
 * Render a key–value data row.
 * Returns empty string when value is null/undefined/''.
 */
export const dr = (k, v, cls = '') =>
  (v == null || v === '')
    ? ''
    : `<div class="dr"><span class="dk">${esc(k)}</span><span class="dv ${cls}">${esc(String(v))}</span></div>`;

/**
 * Deep-clone a WASM proxy or any object to a plain JS object via JSON round-trip.
 * Binary fields (Uint8Array) are replaced with the string '[binary]'.
 */
export function safeJSON(obj) {
  try {
    return JSON.parse(
      JSON.stringify(obj, (_, v) => (v instanceof Uint8Array ? '[binary]' : v))
    );
  } catch {
    return {};
  }
}

/**
 * Convert an EXIF GPS coordinate to a plain decimal number.
 * Values may be a number, a [deg, min, sec] array, rationals {numerator, denominator},
 * or an array-like object from the parser.
 * @param {*} v
 * @returns {number|null}
 */
export function gpsToDecimal(v) {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;

  const isArrayLike =
    Array.isArray(v) ||
    (typeof v === "object" &&
      v != null &&
      "length" in v &&
      typeof v.length === "number" &&
      v.length >= 1 &&
      v.length <= 4);

  if (isArrayLike) {
    const toNum = (x) => {
      if (x == null) return 0;
      if (typeof x === "number") return x;
      if (typeof x === "object" && "numerator" in x) {
        return x.numerator / (x.denominator || 1);
      }
      return Number(x);
    };
    const len = v.length ?? 0;
    const deg = toNum(v[0]) || 0;
    const min = len > 1 ? toNum(v[1]) || 0 : 0;
    const sec = len > 2 ? toNum(v[2]) || 0 : 0;
    const n = deg + min / 60 + sec / 3600;
    return Number.isFinite(n) ? n : null;
  }

  if (typeof v === "object" && "numerator" in v) {
    const n = v.numerator / (v.denominator || 1);
    return Number.isFinite(n) ? n : null;
  }

  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Format a GPS coordinate for display (decimal degrees + optional hemisphere ref).
 * @param {*} v — latitude/longitude value (decimal or DMS)
 * @param {string} [ref] — e.g. "N", "S", "E", "W"
 * @param {number} [digits=6]
 * @returns {string|null}
 */
export function formatGpsCoord(v, ref = "", digits = 6) {
  const dec = gpsToDecimal(v);
  if (dec == null) return null;
  return `${dec.toFixed(digits)}° ${ref}`.trim();
}
