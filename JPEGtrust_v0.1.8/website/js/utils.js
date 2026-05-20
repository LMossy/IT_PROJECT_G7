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
