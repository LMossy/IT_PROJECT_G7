// ─────────────────────────────────────────────────────────────
// emblem.js — SVG emblem generator (multi-dimensional framework)
//
// Final trust judgement values:
//   strong_provenance           — verified sig, trusted cert, original capture
//   verified_with_disclosed_edits — verified sig, disclosed edits/AI
//   provisionally_signed        — valid sig, content intact, cert not in trust store
//   limited_evidence            — no C2PA, camera EXIF present
//   inconsistent_or_suspicious  — C2PA contradicts EXIF
//   tampered                    — content hash mismatch
//   invalid_provenance          — bad sig or revoked cert
//   insufficient_evidence       — no C2PA, no useful EXIF
//
// Arc ring fill represents evidence completeness per dimension.
// ─────────────────────────────────────────────────────────────

/** Arc fill level (0–1) per trust judgement */
const ARC_LEVELS = {
  strong_provenance: 1.0,
  verified_with_disclosed_edits: 0.85,
  provisionally_signed: 0.65,
  limited_evidence: 0.4,
  inconsistent_or_suspicious: 0.3,
  tampered: 0.05,
  invalid_provenance: 0.1,
  insufficient_evidence: 0.0,
  // Legacy aliases (kept for backward compat)
  invalid_or_tampered: 0.1,
};

/** Trust judgement colour configs */
const TRUST_CONFIGS = {
  strong_provenance: { fill: "#E1F5EE", stroke: "#0F6E56", tc: "#0F6E56" }, // teal/green
  verified_with_disclosed_edits: {
    fill: "#FFF8E1",
    stroke: "#FFB300",
    tc: "#FFB300",
  }, // amber
  provisionally_signed: { fill: "#FFF3E0", stroke: "#E65100", tc: "#E65100" }, // deep orange
  limited_evidence: { fill: "#E3F2FD", stroke: "#1565C0", tc: "#1565C0" }, // blue
  inconsistent_or_suspicious: {
    fill: "#FFF8E1",
    stroke: "#FFB300",
    tc: "#FFB300",
  }, // amber/warning
  tampered: { fill: "#FFEBEE", stroke: "#C62828", tc: "#C62828" }, // red
  invalid_provenance: { fill: "#FFEBEE", stroke: "#C62828", tc: "#C62828" }, // red
  insufficient_evidence: { fill: "#F2F3F4", stroke: "#9AA0A6", tc: "#9AA0A6" }, // grey
  // Legacy alias
  invalid_or_tampered: { fill: "#FFEBEE", stroke: "#C62828", tc: "#C62828" },
};

/** Alternative emblem types for different trust levels */
const SHIELD_PATH = "M40,8 L66,20 L66,44 Q66,62 40,74 Q14,62 14,44 L14,20 Z";
const CIRCLE_PATH = "M40,8 A32,32 0 0,1 40,72 A32,32 0 0,1 40,8 Z";

/**
 * Generate an SVG emblem for a given multi-dimensional evaluation result.
 * @param {object}  evalResult — evaluation result from evaluateImage()
 * @param {boolean} small      — if true, renders at 36×36 for thumbnail overlays
 * @returns {string} raw SVG markup
 */
export function makeEmblemFromEval(evalResult, small = false) {
  const size = small ? 36 : 80;
  const { finalTrustJudgement } = evalResult;

  const arcLevel = ARC_LEVELS[finalTrustJudgement] ?? 0;
  const { fill, stroke, tc } =
    TRUST_CONFIGS[finalTrustJudgement] ?? TRUST_CONFIGS.insufficient_evidence;

  // Determine emblem type based on trust judgement
  // Shield = high-confidence outcomes (positive or definitively negative)
  const useShield = [
    "strong_provenance",
    "verified_with_disclosed_edits",
    "provisionally_signed",
    "tampered",
    "invalid_provenance",
    // Legacy alias
    "invalid_or_tampered",
  ].includes(finalTrustJudgement);

  if (useShield) {
    // ── Shield emblem ──────────────────────────────────────────
    const r = 33,
      cx = 40,
      cy = 40;
    const circ = 2 * Math.PI * r;
    const filled = arcLevel * circ;

    const arcEl =
      arcLevel > 0
        ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${stroke}" stroke-width="3" stroke-opacity=".12" stroke-dasharray="${circ.toFixed(1)}"/>
         <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${stroke}" stroke-width="3" stroke-opacity=".6"
           stroke-dasharray="${filled.toFixed(1)} ${(circ - filled).toFixed(1)}"
           stroke-linecap="round" transform="rotate(-90 40 40)"/>`
        : "";

    let icon = "";
    if (finalTrustJudgement === "strong_provenance") {
      icon = `<path d="M28 40l9 9 15-18" fill="none" stroke="${tc}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`;
    } else if (finalTrustJudgement === "verified_with_disclosed_edits") {
      icon = `<path d="M28 40l9 9 15-18" fill="none" stroke="${tc}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" opacity=".8"/>
              <path d="M52 24l4 4-14 14H38v-4Z" fill="${tc}" opacity=".3"/>`;
    } else if (
      finalTrustJudgement === "tampered" ||
      finalTrustJudgement === "invalid_provenance" ||
      finalTrustJudgement === "invalid_or_tampered"
    ) {
      icon = `<path d="M30 30l10 10M30 50l10-10" fill="none" stroke="${tc}" stroke-width="2.5"/>`; // X mark only
    } else if (finalTrustJudgement === "provisionally_signed") {
      // Half-filled checkmark to represent partial trust
      icon = `<path d="M28 40l9 9 15-18" fill="none" stroke="${tc}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/>
              <path d="M22 40 A18,18 0 0,1 40,22" fill="none" stroke="${tc}" stroke-width="2" opacity=".4"/>`; // arc to suggest partial
    }

    return `<svg viewBox="0 0 80 80" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      ${arcEl}
      <path d="${SHIELD_PATH}" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>
      ${icon}
    </svg>`;
  } else {
    // ── Circle emblem ──────────────────────────────────────────
    const r = 32,
      cx = 40,
      cy = 40;
    const circ = 2 * Math.PI * r;
    const filled = arcLevel * circ;

    const arcEl =
      arcLevel > 0
        ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${stroke}" stroke-width="3" stroke-opacity=".12" stroke-dasharray="${circ.toFixed(1)}"/>
         <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${stroke}" stroke-width="3" stroke-opacity=".6"
           stroke-dasharray="${filled.toFixed(1)} ${(circ - filled).toFixed(1)}"
           stroke-linecap="round" transform="rotate(-90 40 40)"/>`
        : "";

    let icon = "";
    if (
      finalTrustJudgement === "limited_evidence" ||
      finalTrustJudgement === "inconsistent_or_suspicious"
    ) {
      icon = `<text x="40" y="50" text-anchor="middle" font-size="16" fill="${tc}" font-family="system-ui,sans-serif" font-weight="600">i</text>`;
    } else if (finalTrustJudgement === "insufficient_evidence") {
      icon = `<text x="40" y="52" text-anchor="middle" font-size="30" fill="${tc}"
        font-family="system-ui,sans-serif" font-weight="300">?</text>`;
    }

    return `<svg viewBox="0 0 80 80" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      ${arcEl}
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>
      ${icon}
    </svg>`;
  }
}

/**
 * Generate an SVG emblem with the analyzed image clipped inside the shield or circle shape.
 * @param {object} evalResult — evaluation result from evaluateImage()
 * @param {string} dataURL    — the image data URL to clip inside the shape
 * @param {number} size       — rendered width/height in px (default 80)
 * @returns {string} raw SVG markup
 */
export function makeEmblemWithImage(evalResult, dataURL, size = 80) {
  const { finalTrustJudgement } = evalResult;
  const { fill, stroke } =
    TRUST_CONFIGS[finalTrustJudgement] ?? TRUST_CONFIGS.insufficient_evidence;
  const useShield = [
    "strong_provenance",
    "verified_with_disclosed_edits",
    "provisionally_signed",
    "tampered",
    "invalid_provenance",
    "invalid_or_tampered",
  ].includes(finalTrustJudgement);
  const uid = `ei${Math.random().toString(36).slice(2, 9)}`;

  if (useShield) {
    return `<svg viewBox="0 0 80 80" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="${uid}">
          <path d="${SHIELD_PATH}"/>
        </clipPath>
      </defs>
      <path d="${SHIELD_PATH}" fill="${fill}"/>
      <image href="${dataURL}" x="14" y="8" width="52" height="66"
        preserveAspectRatio="xMidYMid slice" clip-path="url(#${uid})" opacity="0.85"/>
      <path d="${SHIELD_PATH}" fill="none" stroke="${stroke}" stroke-width="2.5"/>
    </svg>`;
  } else {
    const r = 32,
      cx = 40,
      cy = 40;
    return `<svg viewBox="0 0 80 80" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <clipPath id="${uid}">
          <circle cx="${cx}" cy="${cy}" r="${r}"/>
        </clipPath>
      </defs>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"/>
      <image href="${dataURL}" x="${cx - r}" y="${cy - r}" width="${r * 2}" height="${r * 2}"
        preserveAspectRatio="xMidYMid slice" clip-path="url(#${uid})" opacity="0.85"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${stroke}" stroke-width="2"/>
    </svg>`;
  }
}

// Backward compatibility — accepts evalResult or legacy three-tier cls
export function makeEmblem(clsOrEval, small = false) {
  if (clsOrEval?.finalTrustJudgement) {
    return makeEmblemFromEval(clsOrEval, small);
  }
  const t1 = clsOrEval?.tier1?.classification;
  if (!t1) {
    return makeEmblemFromEval(
      { finalTrustJudgement: "insufficient_evidence" },
      small,
    );
  }
  const evalResult = {
    provenanceStatus:
      t1 === "verified" || t1 === "edited" || t1 === "aiGenerated"
        ? "c2pa_verified"
        : t1 === "no_provenance"
          ? "no_c2pa"
          : "unknown",
    contentEditStatus:
      t1 === "edited"
        ? "disclosed_edits"
        : t1 === "aiGenerated"
          ? "ai_generated"
          : "unknown",
    metadataSupportStatus: "metadata_supports_claim",
    finalTrustJudgement:
      t1 === "verified"
        ? "strong_provenance"
        : t1 === "edited" || t1 === "aiGenerated"
          ? "verified_with_disclosed_edits"
          : t1 === "no_provenance"
            ? "insufficient_evidence"
            : "limited_evidence",
    metadata: {},
  };
  return makeEmblemFromEval(evalResult, small);
}
