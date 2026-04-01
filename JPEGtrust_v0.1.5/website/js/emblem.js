// ─────────────────────────────────────────────────────────────
// emblem.js — SVG emblem generator
//
// Three shapes:
//   Tier 1 → Shield  (C2PA provenance)
//   Tier 2 → Camera  (EXIF evidence)
//   Tier 3 → Circle? (no provenance)
//
// Arc ring fill: fixed per-verdict "evidence completeness" level.
// This replaces the old ad-hoc numeric score — a c2pa_verified
// image always fills fully; c2pa_signed_untrusted at 75%, etc.
// ─────────────────────────────────────────────────────────────

/** Fixed arc fill level (0–1) per verdict — represents evidence completeness, not a computed score */
const ARC_LEVELS = {
  c2pa_verified:         1.00,
  c2pa_signed_untrusted: 0.75,
  c2pa_manifest:         0.50,
  c2pa_ai_declared:      0,    // declaration, not a trust level — no arc
  c2pa_tampered:         0,    // broken — no arc
  exif_camera:           0.60,
  exif_edited:           0.40,
  exif_partial:          0.30,
  no_provenance:         0,
};

/** Tier 1 shield colour configs keyed by verdict */
const SHIELD_CONFIGS = {
  c2pa_verified:         { fill: '#E1F5EE', stroke: '#0F6E56', tc: '#0F6E56' },
  c2pa_signed_untrusted: { fill: '#FEF9E7', stroke: '#C0850A', tc: '#C0850A' },
  c2pa_manifest:         { fill: '#E6F1FB', stroke: '#185FA5', tc: '#185FA5' },
  c2pa_tampered:         { fill: '#FCEBEB', stroke: '#A32D2D', tc: '#A32D2D' },
  c2pa_ai_declared:      { fill: '#EDE9FC', stroke: '#7C5CBF', tc: '#7C5CBF' },
};

const SHIELD_PATH = 'M40,8 L66,20 L66,44 Q66,62 40,74 Q14,62 14,44 L14,20 Z';

/**
 * Generate an SVG emblem for a given classification.
 * @param {object}  cls   — classification result from classifyImage()
 * @param {boolean} small — if true, renders at 36×36 for thumbnail overlays
 * @returns {string} raw SVG markup
 */
export function makeEmblem(cls, small = false) {
  const size = small ? 36 : 80;
  const v        = cls.verdict;
  const arcLevel = ARC_LEVELS[v] ?? 0;

  // ── Tier 1: Shield ──────────────────────────────────────────
  if (cls.tier === 1) {
    const { fill, stroke, tc } = SHIELD_CONFIGS[v] ?? SHIELD_CONFIGS.c2pa_manifest;

    const r      = 33, cx = 40, cy = 40;
    const circ   = 2 * Math.PI * r;
    const filled = arcLevel * circ;

    const arcEl = arcLevel > 0
      ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${stroke}" stroke-width="3" stroke-opacity=".12" stroke-dasharray="${circ.toFixed(1)}"/>
         <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${stroke}" stroke-width="3" stroke-opacity=".6"
           stroke-dasharray="${filled.toFixed(1)} ${(circ - filled).toFixed(1)}"
           stroke-linecap="round" transform="rotate(-90 40 40)"/>`
      : '';

    let icon = '';
    if (v === 'c2pa_verified' || v === 'c2pa_manifest') {
      icon = `<path d="M28 40l9 9 15-18" fill="none" stroke="${tc}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`;
    } else if (v === 'c2pa_signed_untrusted') {
      icon = `<path d="M28 40l9 9 15-18" fill="none" stroke="${tc}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
              <circle cx="40" cy="56" r="3.5" fill="${tc}"/>`;
    } else if (v === 'c2pa_tampered') {
      icon = `<line x1="28" y1="32" x2="52" y2="52" stroke="${tc}" stroke-width="3.5" stroke-linecap="round"/>
              <line x1="52" y1="32" x2="28" y2="52" stroke="${tc}" stroke-width="3.5" stroke-linecap="round"/>`;
    } else if (v === 'c2pa_ai_declared') {
      icon = `<text x="40" y="50" text-anchor="middle" font-size="18" fill="${tc}" font-family="system-ui,sans-serif" font-weight="700">AI</text>`;
    }

    return `<svg viewBox="0 0 80 80" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      ${arcEl}
      <path d="${SHIELD_PATH}" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>
      ${icon}
    </svg>`;
  }

  // ── Tier 2: Camera ──────────────────────────────────────────
  if (cls.tier === 2) {
    const fill   = cls.verdict === 'exif_edited' ? '#FEF5E7' : '#E8F4FD';
    const stroke = cls.verdict === 'exif_edited' ? '#C0850A' : '#2471A3';
    const tc     = stroke;

    const r      = 30, cx = 40, cy = 40;
    const circ   = 2 * Math.PI * r;
    const filled = arcLevel * circ;

    const arc = arcLevel > 0
      ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${stroke}" stroke-width="3" stroke-opacity=".12" stroke-dasharray="${circ.toFixed(1)}"/>
         <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${stroke}" stroke-width="3" stroke-opacity=".6"
           stroke-dasharray="${filled.toFixed(1)} ${(circ - filled).toFixed(1)}"
           stroke-linecap="round" transform="rotate(-90 40 40)"/>`
      : '';

    const editOverlay = cls.verdict === 'exif_edited'
      ? `<path d="M52 24l4 4-14 14H38v-4Z" fill="${tc}" opacity=".7"/>` : '';

    return `<svg viewBox="0 0 80 80" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      ${arc}
      <rect x="12" y="24" width="56" height="38" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
      <rect x="28" y="16" width="16" height="10" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
      <circle cx="40" cy="43" r="12" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
      <circle cx="40" cy="43" r="6" fill="${stroke}" opacity=".25"/>
      <circle cx="40" cy="43" r="3" fill="${stroke}" opacity=".45"/>
      ${editOverlay}
    </svg>`;
  }

  // ── Tier 3: Neutral circle ──────────────────────────────────
  return `<svg viewBox="0 0 80 80" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="40" cy="40" r="32" fill="#F2F3F4" stroke="#9AA0A6" stroke-width="2"/>
    <text x="40" y="52" text-anchor="middle" font-size="30" fill="#9AA0A6"
      font-family="system-ui,sans-serif" font-weight="300">?</text>
  </svg>`;
}
