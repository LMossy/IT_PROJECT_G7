// ─────────────────────────────────────────────────────────────
// emblem.js — SVG emblem generator (revised)
//
// Updated for the revised Trust Indicator Framework:
//   Tier 1: Verified / Edited / AI Generated (shield)
//   Tier 2: Camera-originated / Processed (camera icon)
//   Tier 3: No provenance data (neutral circle)
//
// Arc ring fill represents evidence completeness per tier,
// not a computed numeric score.
// ─────────────────────────────────────────────────────────────

/** Arc fill level (0–1) per revised classification */
const ARC_LEVELS = {
  // Tier 1 — Trust classifications
  verified:         1.00,
  aiGenerated:      0,      // declaration, not trust level
  edited:           0.45,   // moderate — editing occurred but context-dependent
  unverified:       0.35,
  no_provenance:    0,
  // Tier 2 — origin indicators
  camera:           0.60,
  processed:        0.30,
  synthetic:        0,
  unknown:          0,
};

/** Tier 1 shield colour configs keyed by classification */
const SHIELD_CONFIGS = {
  verified:          { fill: '#E1F5EE', stroke: '#0F6E56', tc: '#0F6E56' },
  edited:            { fill: '#FEF5E7', stroke: '#C0850A', tc: '#C0850A' },
  aiGenerated:       { fill: '#EDE9FC', stroke: '#7C5CBF', tc: '#7C5CBF' },
  unverified:        { fill: '#E6F1FB', stroke: '#2471A3', tc: '#2471A3' },
  no_provenance:     { fill: '#F2F3F4', stroke: '#9AA0A6', tc: '#9AA0A6' },
};

/** Tier 2 camera colour configs */
const CAMERA_CONFIGS = {
  camera:    { fill: '#E8F4FD', stroke: '#2471A3' },
  processed: { fill: '#FEF5E7', stroke: '#C0850A' },
  synthetic: { fill: '#EDE9FC', stroke: '#7C5CBF' },
  unknown:   { fill: '#F2F3F4', stroke: '#9AA0A6' },
};

const SHIELD_PATH = 'M40,8 L66,20 L66,44 Q66,62 40,74 Q14,62 14,44 L14,20 Z';

/**
 * Generate an SVG emblem for a given three-tier classification.
 * @param {object}  cls   — classification result from classifyImage()
 * @param {boolean} small — if true, renders at 36×36 for thumbnail overlays
 * @returns {string} raw SVG markup
 */
export function makeEmblem(cls, small = false) {
  const size = small ? 36 : 80;

  // Determine which classification to use for emblem rendering
  // Use tier1.classification for the primary visual indicator
  const v = cls.tier1.classification;
  const arcLevel = ARC_LEVELS[v] ?? 0;

  // ── Tier 1: Shield ──────────────────────────────────────────
  if (v === 'verified' || v === 'edited' || v === 'aiGenerated') {
    const { fill, stroke, tc } = SHIELD_CONFIGS[v] ?? SHIELD_CONFIGS.unverified;

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
      if (v === 'verified') {
        icon = `<path d="M28 40l9 9 15-18" fill="none" stroke="${tc}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`;
      } else if (v === 'edited') {
        icon = `<path d="M28 40l9 9 15-18" fill="none" stroke="${tc}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" opacity=".6"/>
                <path d="M52 24l4 4-14 14H38v-4Z" fill="${tc}" opacity=".5"/>`;
      } else if (v === 'aiGenerated') {
        icon = `<text x="40" y="50" text-anchor="middle" font-size="18" fill="${tc}" font-family="system-ui,sans-serif" font-weight="700">AI</text>`;
      }

      return `<svg viewBox="0 0 80 80" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        ${arcEl}
        <path d="${SHIELD_PATH}" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>
        ${icon}
      </svg>`;
    }
  }

  // ── Tier 2: Camera ──────────────────────────────────────────
  if (cls.tier2 && cls.tier2.indicator !== 'unknown') {
    const ind = cls.tier2.indicator;
    const { fill, stroke } = CAMERA_CONFIGS[ind] ?? CAMERA_CONFIGS.unknown;
    const tc = stroke;

    const r      = 30, cx = 40, cy = 40;
    const circ   = 2 * Math.PI * r;
    const filled = arcLevel * circ;

    const arc = arcLevel > 0
      ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${stroke}" stroke-width="3" stroke-opacity=".12" stroke-dasharray="${circ.toFixed(1)}"/>
         <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${stroke}" stroke-width="3" stroke-opacity=".6"
           stroke-dasharray="${filled.toFixed(1)} ${(circ - filled).toFixed(1)}"
           stroke-linecap="round" transform="rotate(-90 40 40)"/>`
      : '';

    const editOverlay = ind === 'processed'
      ? `<path d="M52 24l4 4-14 14H38v-4Z" fill="${tc}" opacity=".6"/>` : '';

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

  // ── Tier 3: Neutral circle (fallback) ────────────────────────
  return `<svg viewBox="0 0 80 80" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="40" cy="40" r="32" fill="#F2F3F4" stroke="#9AA0A6" stroke-width="2"/>
    <text x="40" y="52" text-anchor="middle" font-size="30" fill="#9AA0A6"
      font-family="system-ui,sans-serif" font-weight="300">?</text>
  </svg>`;
}