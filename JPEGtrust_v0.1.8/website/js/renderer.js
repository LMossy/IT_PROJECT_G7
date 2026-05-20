// ─────────────────────────────────────────────────────────────
// renderer.js — report building and DOM injection (multi-dimensional framework)
// ─────────────────────────────────────────────────────────────
import { esc, dr } from "./utils.js";
import { makeEmblemFromEval, makeEmblemWithImage } from "./emblem.js";

// ─── Summary explanations for each trust judgement ────────────────────────
const TRUST_SUMMARIES = {
  strong_provenance:
    "This image carries a valid C2PA manifest with a cryptographically verified signature from a trusted certificate. The content appears to be original camera capture with no undisclosed edits, and the EXIF metadata is consistent with the provenance claims.",
  verified_with_disclosed_edits:
    "This image carries a valid C2PA manifest with a cryptographically verified signature. The provenance discloses edits or AI/synthetic generation, which are clearly documented in the manifest. This is common in legitimate professional workflows and does not indicate deception.",
  provisionally_signed:
    "The C2PA manifest carries a cryptographically valid signature and the content has not been modified since signing. However, the signing certificate is not in the SDK's pre-approved trust store — this is expected for self-signed certificates, pre-production certs, and certs from organisations not yet listed in the trust store. This is NOT evidence of tampering.",
  limited_evidence:
    "Some provenance data is available but insufficient for a strong trust assessment. This may include images with basic camera metadata but no C2PA manifest, or C2PA metadata that could not be fully validated.",
  inconsistent_or_suspicious:
    "The C2PA provenance is valid but contradicted by EXIF metadata, suggesting possible inconsistencies that require further investigation.",
  tampered:
    "A content hash mismatch was detected — the image bytes were modified after the C2PA manifest was signed. The provenance chain has been broken and the integrity of the image cannot be guaranteed.",
  invalid_provenance:
    "The C2PA manifest is present but the signature is invalid or the signing certificate has been revoked. This means the claimed provenance cannot be trusted.",
  insufficient_evidence:
    "No C2PA manifest and no significant EXIF metadata were found. The origin, authorship, and editing history of this image are unknown. This is normal for screenshots, web exports, and many AI-generated images — it does not imply manipulation.",
  // Legacy alias
  invalid_or_tampered:
    "The C2PA manifest is present but invalid or tampered. The signature could not be verified, the certificate is untrusted or revoked, or the content has been modified after signing without proper disclosure.",
};

const TRUST_LABELS = {
  strong_provenance: "Strong Provenance",
  verified_with_disclosed_edits: "Verified with Disclosed Edits",
  provisionally_signed: "Provisionally Signed",
  limited_evidence: "Limited Evidence",
  inconsistent_or_suspicious: "Inconsistent or Suspicious",
  tampered: "Tampered",
  invalid_provenance: "Invalid Provenance",
  insufficient_evidence: "Insufficient Evidence",
  // Legacy alias
  invalid_or_tampered: "Invalid or Tampered",
};

const TRUST_COLORS = {
  strong_provenance: "cteal",
  verified_with_disclosed_edits: "cteal",
  provisionally_signed: "camber",
  limited_evidence: "cblue",
  inconsistent_or_suspicious: "camber",
  tampered: "cred",
  invalid_provenance: "cred",
  insufficient_evidence: "cgrey",
  // Legacy alias
  invalid_or_tampered: "cred",
};

const DIMENSION_LABELS = {
  provenanceStatus: "Provenance status",
  contentEditStatus: "Content / edit status",
  metadataSupportStatus: "Metadata support",
  finalTrustJudgement: "Final trust judgement",
};

const STATUS_ICON = {
  ok: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#0a7c59" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l4 4 6-7"/></svg>',
  warn: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#b45309" stroke-width="2" stroke-linecap="round"><path d="M8 3v5M8 11v1"/><path d="M2 13L8 3l6 10H2z"/></svg>',
  bad: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#c0392b" stroke-width="2" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  neutral:
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round"><path d="M4 8h8"/></svg>',
  info: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#1a5fa8" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 7v4M8 5v.5"/></svg>',
  purple:
    '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#6d3fb5" stroke-width="2" stroke-linecap="round"><path d="M3 8l4 4 6-7"/></svg>',
};

const STATUS_TEXT_CLASS = {
  ok: "cteal",
  warn: "camber",
  bad: "cred",
  neutral: "cgrey",
  info: "cblue",
  purple: "cpurp",
};
const BULLET_TYPE_CLASS = {
  ok: "r-ok",
  info: "r-info",
  warn: "r-warn",
  bad: "r-bad",
  neutral: "r-neutral",
};

// ─── Trust profile — all factors that influenced the assessment ─────────────
/**
 * @returns {Array<{category:string, label:string, value:string, status:string}>}
 */
export function buildTrustProfile(evalResult, sr) {
  const factors = [];
  const {
    provenanceStatus,
    contentEditStatus,
    metadataSupportStatus,
    finalTrustJudgement,
    metadata,
  } = evalResult;

  factors.push({
    category: "Assessment",
    label: DIMENSION_LABELS.provenanceStatus,
    value: formatProvenanceStatus(provenanceStatus),
    status:
      provenanceStatus === "c2pa_fully_verified"
        ? "ok"
        : provenanceStatus === "c2pa_signed_unverified_cert"
          ? "warn"
          : provenanceStatus === "c2pa_tampered" ||
              provenanceStatus === "c2pa_invalid"
            ? "bad"
            : // Legacy aliases
              provenanceStatus === "c2pa_verified"
              ? "ok"
              : provenanceStatus === "c2pa_invalid_or_tampered"
                ? "bad"
                : "neutral",
  });
  factors.push({
    category: "Assessment",
    label: DIMENSION_LABELS.contentEditStatus,
    value: formatContentEditStatus(contentEditStatus),
    status:
      contentEditStatus === "original_or_camera_capture"
        ? "ok"
        : contentEditStatus === "suspected_undisclosed_editing"
          ? "warn"
          : contentEditStatus === "ai_generated" ||
              contentEditStatus === "ai_generated_or_synthetic"
            ? "purple"
            : "info",
  });
  factors.push({
    category: "Assessment",
    label: DIMENSION_LABELS.metadataSupportStatus,
    value: formatMetadataSupportStatus(metadataSupportStatus),
    status:
      metadataSupportStatus === "metadata_supports_claim"
        ? "ok"
        : metadataSupportStatus === "metadata_inconsistent"
          ? "warn"
          : "neutral",
  });
  factors.push({
    category: "Assessment",
    label: DIMENSION_LABELS.finalTrustJudgement,
    value: formatTrustJudgement(finalTrustJudgement),
    status:
      finalTrustJudgement === "strong_provenance" ||
      finalTrustJudgement === "verified_with_disclosed_edits"
        ? "ok"
        : finalTrustJudgement === "tampered" ||
            finalTrustJudgement === "invalid_provenance" ||
            finalTrustJudgement === "invalid_or_tampered"
          ? "bad"
          : finalTrustJudgement === "inconsistent_or_suspicious" ||
              finalTrustJudgement === "provisionally_signed"
            ? "warn"
            : "info",
  });

  if (metadata) {
    factors.push({
      category: "C2PA signals",
      label: "C2PA manifest present",
      value: metadata.hasC2pa ? "Yes" : "No",
      status: metadata.hasC2pa ? "ok" : "neutral",
    });
    if (metadata.hasC2pa) {
      factors.push({
        category: "C2PA signals",
        label: "Signature cryptographically valid",
        value: metadata.sigOK ? "Yes" : "No",
        status: metadata.sigOK ? "ok" : "bad",
      });
      factors.push({
        category: "C2PA signals",
        label: "Signing certificate trusted",
        value: metadata.certUntrusted ? "No — not in trust store" : "Yes",
        status: metadata.certUntrusted ? "warn" : "ok",
      });
      factors.push({
        category: "C2PA signals",
        label: "Certificate revoked",
        value: metadata.certRevoked ? "Yes" : "No",
        status: metadata.certRevoked ? "bad" : "ok",
      });
      factors.push({
        category: "C2PA signals",
        label: "Content mismatch after signing",
        value: metadata.contentMismatch ? "Yes — tampering suspected" : "No",
        status: metadata.contentMismatch ? "bad" : "ok",
      });
      if (metadata.actions?.length) {
        factors.push({
          category: "C2PA signals",
          label: "Logged edit actions",
          value: `${metadata.actions.length} action(s) in manifest`,
          status: "info",
        });
      }
      if (metadata.assertions?.length) {
        factors.push({
          category: "C2PA signals",
          label: "Manifest assertions",
          value: `${metadata.assertions.length} assertion(s)`,
          status: "info",
        });
      }
    }
  }

  for (const row of sr?.evidence ?? []) {
    factors.push({
      category: "Evidence",
      label: row.label,
      value: row.value,
      status: row.status,
    });
  }

  for (const sig of sr?.signals ?? []) {
    factors.push({
      category: "Analysis log",
      label: sig.text,
      value: "—",
      status: sig.status,
    });
  }

  return factors;
}

export function buildReasonBullets(evalResult, mfst, exif, file) {
  const bullets = [];
  const add = (text, type = "info") => bullets.push({ text, type });

  const {
    provenanceStatus,
    contentEditStatus,
    metadataSupportStatus,
    finalTrustJudgement,
    metadata,
  } = evalResult;

  if (
    provenanceStatus === "c2pa_fully_verified" ||
    provenanceStatus === "c2pa_verified"
  ) {
    add(
      "C2PA manifest found with a cryptographically verified signature from a trusted certificate.",
      "ok",
    );
  } else if (provenanceStatus === "c2pa_signed_unverified_cert") {
    add(
      "C2PA manifest found — signature is cryptographically valid and content is intact.",
      "ok",
    );
    add(
      "Certificate is not in the SDK trust store (self-signed / pre-production) — this does NOT indicate tampering.",
      "warn",
    );
  } else if (provenanceStatus === "c2pa_tampered") {
    add(
      "Content hash mismatch — the image was modified after the C2PA manifest was signed.",
      "bad",
    );
  } else if (
    provenanceStatus === "c2pa_invalid" ||
    provenanceStatus === "c2pa_invalid_or_tampered"
  ) {
    if (metadata.contentMismatch)
      add(
        "Content mismatch detected — image modified after signing without proper disclosure.",
        "bad",
      );
    if (metadata.certRevoked)
      add("Signing certificate has been revoked.", "bad");
    if (!metadata.sigOK)
      add("C2PA signature could not be cryptographically verified.", "bad");
    if (metadata.certUntrusted)
      add(
        "Signature valid but certificate not in SDK trust store (may be pre-production or self-signed).",
        "warn",
      );
  } else if (provenanceStatus === "no_c2pa") {
    add("No C2PA manifest found in this image.", "neutral");
  }

  if (contentEditStatus === "original_or_camera_capture") {
    add(
      "Content appears to be original camera capture with no disclosed edits.",
      "ok",
    );
  } else if (contentEditStatus === "disclosed_edits") {
    add(
      "Edits are disclosed in the C2PA manifest — common in professional photography workflows.",
      "info",
    );
  } else if (
    contentEditStatus === "ai_generated" ||
    contentEditStatus === "ai_generated_or_synthetic"
  ) {
    add("AI/synthetic origin declared in provenance.", "info");
  } else if (contentEditStatus === "suspected_undisclosed_editing") {
    add(
      "Editing software detected in EXIF but no provenance disclosure found.",
      "warn",
    );
  }

  if (metadataSupportStatus === "metadata_supports_claim") {
    add("EXIF metadata is consistent with C2PA provenance claims.", "ok");
  } else if (metadataSupportStatus === "metadata_inconsistent") {
    add("EXIF metadata contradicts C2PA provenance claims.", "warn");
  } else if (metadataSupportStatus === "metadata_missing_or_stripped") {
    add("No useful metadata found for provenance assessment.", "neutral");
  }

  if (finalTrustJudgement === "strong_provenance") {
    add("Strong provenance evidence supports authenticity assessment.", "ok");
  } else if (finalTrustJudgement === "verified_with_disclosed_edits") {
    add(
      "Valid provenance with disclosed edits supports cautious trust assessment.",
      "ok",
    );
  } else if (finalTrustJudgement === "limited_evidence") {
    add("Limited evidence available — treat with cautious optimism.", "info");
  } else if (finalTrustJudgement === "inconsistent_or_suspicious") {
    add("Inconsistent evidence requires further investigation.", "warn");
  } else if (finalTrustJudgement === "provisionally_signed") {
    add(
      "Valid cryptographic signature with intact content, but certificate is not in the SDK trust store — provisional trust assessment.",
      "warn",
    );
  } else if (finalTrustJudgement === "tampered") {
    add(
      "Content hash mismatch detected — the image was modified after signing.",
      "bad",
    );
  } else if (
    finalTrustJudgement === "invalid_provenance" ||
    finalTrustJudgement === "invalid_or_tampered"
  ) {
    add(
      "Invalid or tampered provenance indicates likely inauthenticity.",
      "bad",
    );
  } else if (finalTrustJudgement === "insufficient_evidence") {
    add(
      "Insufficient evidence to determine authenticity — absence of proof is not proof of absence.",
      "neutral",
    );
  }

  if (
    bullets.length < 4 &&
    !metadata.hasC2pa &&
    (!exif || Object.keys(exif).length <= 3)
  ) {
    add("No significant EXIF metadata found.", "neutral");
  }

  return bullets.slice(0, 4);
}

export function buildDetailSections(file, mfst, exif, evalResult, sr) {
  let html = "";
  const {
    provenanceStatus,
    contentEditStatus,
    metadataSupportStatus,
    finalTrustJudgement,
  } = evalResult;

  html += `<div class="dimension-summary">`;
  html += `<div class="dimension-row"><span class="dimension-label">Provenance Status</span><span class="dimension-val">${formatProvenanceStatus(provenanceStatus)}</span></div>`;
  html += `<div class="dimension-row"><span class="dimension-label">Content/Edit Status</span><span class="dimension-val">${formatContentEditStatus(contentEditStatus)}</span></div>`;
  html += `<div class="dimension-row"><span class="dimension-label">Metadata Support</span><span class="dimension-val">${formatMetadataSupportStatus(metadataSupportStatus)}</span></div>`;
  html += `<div class="dimension-row"><span class="dimension-label">Trust Judgement</span><span class="dimension-val ${getTrustColourClass(finalTrustJudgement)}">${formatTrustJudgement(finalTrustJudgement)}</span></div>`;
  html += `</div>`;

  if (mfst) {
    let pretty = "";
    try {
      pretty = JSON.stringify(
        mfst,
        (_, v) => (v instanceof Uint8Array ? "[binary]" : v),
        2,
      );
    } catch {}
    html += `<div class="blk"><div class="bh">Raw manifest (JSON)</div><div class="raw">${esc(pretty)}</div></div>`;
  }

  const hasExif = exif && Object.keys(exif).length > 0;
  if (hasExif) {
    const e = exif;
    const make = e.Make ?? e.make ?? null;
    const model = e.Model ?? e.model ?? null;
    const sw = e.Software ?? null;
    const dOrig =
      e.DateTimeOriginal instanceof Date
        ? e.DateTimeOriginal.toLocaleString()
        : (e.DateTimeOriginal ?? null);
    const dMod =
      e.ModifyDate instanceof Date
        ? e.ModifyDate.toLocaleString()
        : (e.ModifyDate ?? e.DateTime ?? null);
    const iso = e.ISO ?? e.ISOSpeedRatings ?? null;
    const fn = e.FNumber != null ? `f/${+e.FNumber.toFixed(1)}` : null;
    const focal =
      e.FocalLength != null ? `${+e.FocalLength.toFixed(1)} mm` : null;
    const fl35 =
      e.FocalLengthIn35mmFormat != null
        ? `${e.FocalLengthIn35mmFormat} mm`
        : null;
    const exp2 =
      e.ExposureTime != null
        ? `${+e.ExposureTime.toFixed(6).replace(/\.?0+$/, "")} s`
        : null;
    const flash = e.Flash != null ? String(e.Flash) : null;
    const wb = e.WhiteBalance != null ? String(e.WhiteBalance) : null;
    const gpsLat =
      e.GPSLatitude != null
        ? `${+e.GPSLatitude.toFixed(6)}° ${e.GPSLatitudeRef ?? ""}`.trim()
        : null;
    const gpsLon =
      e.GPSLongitude != null
        ? `${+e.GPSLongitude.toFixed(6)}° ${e.GPSLongitudeRef ?? ""}`.trim()
        : null;
    const alt = e.GPSAltitude != null ? `${+e.GPSAltitude.toFixed(1)} m` : null;
    const cs =
      e.ColorSpace != null
        ? e.ColorSpace === 1
          ? "sRGB"
          : e.ColorSpace === 65535
            ? "Uncalibrated"
            : String(e.ColorSpace)
        : null;
    const dims =
      e.PixelXDimension && e.PixelYDimension
        ? `${e.PixelXDimension} × ${e.PixelYDimension} px`
        : null;
    const xres =
      e.XResolution != null ? `${Math.round(e.XResolution)} dpi` : null;
    const lens = e.LensModel ?? null;
    const lmake = e.LensMake ?? null;
    const serialB = e.BodySerialNumber ?? e.CameraSerialNumber ?? null;

    html += `
      <div class="mg">
        <div class="blk"><div class="bh">Camera & device (EXIF — unverified)</div>
          ${dr("Make", make, make ? "ok" : "")}
          ${dr("Model", model, model ? "ok" : "")}
          ${dr("Software", sw)}
          ${dr("Lens make", lmake)}
          ${dr("Lens model", lens)}
          ${dr("Body serial", serialB)}
        </div>
        <div class="blk"><div class="bh">Capture settings (EXIF — unverified)</div>
          ${dr("ISO", iso)}
          ${dr("Aperture", fn)}
          ${dr("Exposure", exp2)}
          ${dr("Focal length", focal)}
          ${dr("Focal (35mm)", fl35)}
          ${dr("Flash", flash)}
          ${dr("White balance", wb)}
        </div>
        <div class="blk"><div class="bh">Timestamps (EXIF — unverified)</div>
          ${dr("Date captured", dOrig, dOrig ? "ok" : "wn")}
          ${dr("Date modified", dMod)}
        </div>
        <div class="blk"><div class="bh">Location & image (EXIF — unverified)</div>
          ${dr("GPS latitude", gpsLat, gpsLat ? "if" : "")}
          ${dr("GPS longitude", gpsLon, gpsLon ? "if" : "")}
          ${dr("GPS altitude", alt)}
          ${dr("Colour space", cs)}
          ${dr("Dimensions", dims)}
          ${dr("Resolution", xres)}
        </div>
      </div>`;
  } else {
    html += `<div class="blk"><div class="bh">Image metadata (EXIF)</div>
      <div class="np">No EXIF metadata found. This is expected for screenshots, AI-generated images, and web-optimised exports.</div></div>`;
  }
  return html;
}

function buildTrustProfileHTML(evalResult, sr) {
  const factors = buildTrustProfile(evalResult, sr);
  const summary = TRUST_SUMMARIES[evalResult.finalTrustJudgement] ?? "";

  const rows = factors
    .map(
      (f) => `
    <div class="tp-row">
      <span class="tp-icon">${STATUS_ICON[f.status] ?? STATUS_ICON.neutral}</span>
      <span class="tp-cat">${esc(f.category)}</span>
      <span class="tp-label">${esc(f.label)}</span>
      <span class="tp-value ${STATUS_TEXT_CLASS[f.status] ?? "cgrey"}">${esc(f.value)}</span>
    </div>`,
    )
    .join("");

  return `
    <div class="trust-profile">
      <div class="trust-profile-h">Trust profile — factors affecting this assessment</div>
      <p class="trust-profile-summary">${esc(summary)}</p>
      <div class="trust-profile-list">${rows}</div>
    </div>`;
}

/** Build side-panel check items (compact vertical list) */
function buildSideChecksHTML(checks) {
  const SCK = {
    pass: "sck-pass",
    fail: "sck-fail",
    warn: "sck-warn",
    info: "sck-info",
    na: "sck-na",
  };
  const item = (c) => `
    <div class="sck ${SCK[c.status] ?? "sck-na"}">
      <span class="sck-dot"></span>
      <span class="sck-body">
        <span class="sck-lbl">${esc(c.label)}</span>
        <span class="sck-info-txt">${esc(c.detail)}</span>
      </span>
    </div>`;
  return {
    left: checks.slice(0, 5).map(item).join(""),
    right: checks.slice(5, 10).map(item).join(""),
  };
}

/** Build a forensic risk bar (no raw %) */
function _riskBar(risk, label) {
  const cls =
    risk >= 70 ? "frisk-high" : risk >= 35 ? "frisk-med" : "frisk-low";
  return `
    <div class="frisk-row">
      <span class="frisk-lbl">${esc(label)}</span>
    </div>
    <div class="frisk-track"><div class="frisk-fill ${cls}" style="width:${risk}%"></div></div>`;
}

/** Build one forensic tab panel */
function _forensicPanel(
  id,
  vis,
  visNote,
  tableRows,
  riskHTML,
  verdict,
  verdictType,
  footerNote,
) {
  const vIcons = {
    pass: `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#0a7c59" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l4 4 6-7"/></svg>`,
    fail: `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#c0392b" stroke-width="2.2" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>`,
    warn: `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#b45309" stroke-width="2" stroke-linecap="round"><path d="M8 3v5M8 11v1"/><path d="M2 13L8 3l6 10H2z"/></svg>`,
    info: `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#1a5fa8" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 7v4M8 5v.5"/></svg>`,
  };
  const vClass = {
    pass: "fv-pass",
    fail: "fv-fail",
    warn: "fv-warn",
    info: "fv-info",
  };
  return `
    <div class="ftab-panel" id="ftab-${id}">
      <div class="fpanel-l">
        <div class="fpanel-vis-lbl">${esc(id.toUpperCase().replace(/-/g, " "))}</div>
        <img class="fpanel-vis" src="${vis}" alt="${esc(id)} visual">
        ${visNote ? `<p class="fpanel-vis-note">${esc(visNote)}</p>` : ""}
      </div>
      <div class="fpanel-r">
        <table class="fpanel-table">
          <thead><tr><th>Metric</th><th>Value</th></tr></thead>
          <tbody>${tableRows}</tbody>
        </table>
        ${riskHTML}
        <div class="fpanel-verdict ${vClass[verdictType] ?? "fv-info"}">
          ${vIcons[verdictType] ?? vIcons.info}
          <span>${esc(verdict)}</span>
        </div>
        ${footerNote ? `<p class="fpanel-note">${footerNote}</p>` : ""}
      </div>
    </div>`;
}

/** Build a table row */
function _tr(k, v) {
  return `<tr><td>${esc(String(k))}</td><td>${esc(String(v))}</td></tr>`;
}

/** Build the full forensic tabs section */
function buildForensicTabsHTML(forensics, evalResult) {
  if (!forensics || forensics.error) return "";
  const { ela, clone, noise, ai } = forensics;
  if (!ela || !clone || !noise || !ai) return "";

  const elaPanel = _forensicPanel(
    "ela",
    ela.visualURL,
    ela.isLossless
      ? "\u26a0 Lossless source (PNG/WebP): higher baseline ELA is normal \u2014 results are indicative only."
      : null,
    [
      _tr("Max ELA value", ela.maxELA),
      _tr("Avg ELA value", ela.avgELA),
      _tr("High-ELA pixels", ela.highELAPct + "%"),
      _tr("Source format", ela.sourceFormat),
    ].join(""),
    _riskBar(ela.risk, "Manipulation Risk"),
    ela.verdict,
    ela.verdictType,
    "Bright patches = high compression difference (\u00d712 amplified). Uniform edits show consistent brightness; copy-paste regions often show isolated bright areas.",
  );

  const clonePanel = _forensicPanel(
    "clone-detection",
    clone.visualURL,
    null,
    [
      _tr("Matching block pairs", clone.matchingPairs),
      _tr("Suspicious blocks", clone.suspiciousBlocks),
      _tr("Block size", clone.blockSize),
      _tr("Grid size", clone.gridSize),
    ].join(""),
    _riskBar(clone.risk, "Clone Risk"),
    clone.verdict,
    clone.verdictType,
    "Blocks \u226532px apart sharing near-identical pixel patterns are flagged. Each colour pair marks one potential clone group. Uniform-colour areas (sky, walls) may generate false matches.",
  );

  const noisePanel = _forensicPanel(
    "noise-analysis",
    noise.visualURL,
    null,
    [
      _tr("Median noise level", noise.medianNoise),
      _tr("Max noise level", noise.maxNoise),
      _tr("Outlier blocks", `${noise.outlierCount} (${noise.outlierPct}%)`),
      _tr("Grid", noise.gridSize),
    ].join(""),
    _riskBar(noise.inconsistencyScore, "Noise Inconsistency"),
    noise.verdict,
    noise.verdictType,
    "Red overlay = high-noise outlier blocks. Yellow overlay = moderately elevated noise. Composite images often show sharp noise boundaries at splice edges.",
  );

  // AI Detection signals list
  const sigIcons = {
    pass: `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="#0a7c59" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l4 4 6-7"/></svg>`,
    warn: `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="#b45309" stroke-width="2" stroke-linecap="round"><path d="M8 3v5M8 11v1"/><path d="M2 13L8 3l6 10H2z"/></svg>`,
    info: `<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="#1a5fa8" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 7v4M8 5v.5"/></svg>`,
  };
  const sigList = (ai.signals ?? [])
    .map(
      (s) =>
        `<div class="fai-signal fai-${s.type ?? "info"}">${sigIcons[s.type] ?? sigIcons.info}<span>${esc(s.text)}</span></div>`,
    )
    .join("");

  // Metadata AI evidence banner (from evalResult — reliable signal)
  const aiTags = evalResult?.metadata?.aiGeneratorTags ?? [];
  const c2paAI = evalResult?.metadata?.isAI ?? false;
  let metaBanner = "";
  if (aiTags.length > 0) {
    metaBanner = `
      <div class="fai-meta-banner fai-meta-confirmed">
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="#c0392b" stroke-width="2.2" stroke-linecap="round"><path d="M8 3v5M8 11v1"/><path d="M2 13L8 3l6 10H2z"/></svg>
        <div>
          <span class="fai-meta-title">AI Origin Confirmed by Metadata</span>
          <span class="fai-meta-detail">Generator tag detected in EXIF/XMP: ${esc(aiTags.slice(0, 2).join(", "))}</span>
        </div>
      </div>`;
  } else if (c2paAI) {
    metaBanner = `
      <div class="fai-meta-banner fai-meta-c2pa">
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="#6d3fb5" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 7v4M8 5v.5"/></svg>
        <div>
          <span class="fai-meta-title">AI Origin Declared via C2PA</span>
          <span class="fai-meta-detail">The C2PA manifest declares AI/synthetic digital source type.</span>
        </div>
      </div>`;
  }

  // Decide AI panel verdict colour based on metadata + pixel combined
  const hasMetaAI = aiTags.length > 0 || c2paAI;
  const aiVerdictClass = hasMetaAI
    ? "fv-fail"
    : ai.verdictType === "pass"
      ? "fv-pass"
      : ai.verdictType === "fail"
        ? "fv-fail"
        : "fv-warn";
  const aiVerdictText =
    hasMetaAI && aiTags.length > 0
      ? "AI origin confirmed by metadata — pixel statistics are secondary"
      : hasMetaAI
        ? "AI origin declared in C2PA — pixel statistics are secondary"
        : ai.verdict;
  const aiVerdictIcon =
    hasMetaAI || ai.verdictType !== "pass"
      ? `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="${hasMetaAI ? "#c0392b" : "#b45309"}" stroke-width="2" stroke-linecap="round"><path d="M8 3v5M8 11v1"/><path d="M2 13L8 3l6 10H2z"/></svg>`
      : `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#0a7c59" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l4 4 6-7"/></svg>`;

  const uniformityRow =
    ai.noiseUniformityRatio !== null
      ? _tr(
          "Noise uniformity ratio",
          ai.noiseUniformityRatio + " (natural: >1.3)",
        )
      : _tr(
          "Noise uniformity ratio",
          "N/A — image lacks dark or bright regions",
        );
  const smoothRow =
    ai.smoothNoise !== null
      ? _tr("Smooth-region noise floor", ai.smoothNoise + " (natural: >0.6)")
      : _tr("Smooth-region noise floor", "N/A — no smooth regions found");

  const aiPanel = `
    <div class="ftab-panel" id="ftab-ai-detection">
      <div class="fpanel-l">
        <div class="fpanel-vis-lbl">NOISE NATURALNESS MAP</div>
        <img class="fpanel-vis" src="${noise.naturalMapURL}" alt="AI naturalness map">
        <p class="fpanel-vis-note">Red = low residual kurtosis (smooth, AI-like). Orange = borderline. Green = heavy-tailed (natural).</p>
      </div>
      <div class="fpanel-r">
        ${metaBanner}
        <table class="fpanel-table">
          <thead><tr><th>Metric</th><th>Value</th></tr></thead>
          <tbody>
            ${_tr("Global noise kurtosis", ai.kurtosis + " (natural: 3.5–15)")}
            ${_tr("Texture diversity CV", ai.textureCV + " (natural: >0.55)")}
            ${uniformityRow}
            ${smoothRow}
          </tbody>
        </table>
        ${_riskBar(ai.aiScore, "AI Generation Likelihood (pixel only)")}
        <div class="fpanel-verdict ${aiVerdictClass}">
          ${aiVerdictIcon}
          <span>${esc(aiVerdictText)}</span>
        </div>
        <div class="fai-signals">${sigList}</div>
        <p class="fpanel-note">Pixel-level AI detection is an unreliable signal for modern generative models. Use metadata tags (above) as the primary indicator. Map key: \u25a0 Low residual kurtosis (AI-like) \u25a0 Borderline \u25a0 Natural.</p>
      </div>
    </div>`;

  return `
    <div class="forensic-wrap">
      <div class="forensic-hdr">Pixel-Level Forensic Analysis</div>
      <div class="forensic-tabs" id="forensicTabs">
        <button class="ftab active" data-target="ftab-ela">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 2h12v12H2z"/><path d="M2 8h12M8 2v12" stroke-opacity=".4"/></svg>
          ELA
        </button>
        <button class="ftab" data-target="ftab-clone-detection">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/><path d="M9 4.5h1.5a2 2 0 012 2V9" stroke-opacity=".5"/></svg>
          Clone Detection
        </button>
        <button class="ftab" data-target="ftab-noise-analysis">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 8l2-3 2 5 2-7 2 5 2-2 2 2"/></svg>
          Noise Analysis
        </button>
        <button class="ftab" data-target="ftab-ai-detection">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="8" r="5"/><path d="M8 5v3l2 2"/></svg>
          AI Detection
        </button>
      </div>
      <div class="forensic-body">
        ${elaPanel}
        ${clonePanel}
        ${noisePanel}
        ${aiPanel}
      </div>
      <p class="forensic-note">All forensic analysis runs entirely in your browser using JavaScript and the HTML5 Canvas API. No image data is transmitted to any server. Results are probabilistic indicators \u2014 not definitive proof of manipulation.</p>
    </div>`;
}

/** Inject the full report into #report (always framed layout). */
export function renderReport(
  file,
  dataURL,
  mfst,
  exif,
  evalResult,
  sr,
  forensics,
  onReset,
) {
  const {
    finalTrustJudgement,
    provenanceStatus,
    contentEditStatus,
    metadataSupportStatus,
  } = evalResult;
  const colorClass = getTrustColourClass(finalTrustJudgement);

  // Status icons for each dimension
  const provSt =
    provenanceStatus === "c2pa_fully_verified" ||
    provenanceStatus === "c2pa_verified"
      ? "ok"
      : provenanceStatus === "c2pa_signed_unverified_cert"
        ? "warn"
        : provenanceStatus === "c2pa_tampered" ||
            provenanceStatus === "c2pa_invalid" ||
            provenanceStatus === "c2pa_invalid_or_tampered"
          ? "bad"
          : "neutral";
  const contSt =
    contentEditStatus === "original_or_camera_capture"
      ? "ok"
      : contentEditStatus === "suspected_undisclosed_editing"
        ? "warn"
        : contentEditStatus === "ai_generated" ||
            contentEditStatus === "ai_generated_or_synthetic"
          ? "purple"
          : "info";
  const metaSt =
    metadataSupportStatus === "metadata_supports_claim"
      ? "ok"
      : metadataSupportStatus === "metadata_inconsistent"
        ? "warn"
        : "neutral";
  const trustSt =
    finalTrustJudgement === "strong_provenance" ||
    finalTrustJudgement === "verified_with_disclosed_edits"
      ? "ok"
      : finalTrustJudgement === "tampered" ||
          finalTrustJudgement === "invalid_provenance" ||
          finalTrustJudgement === "invalid_or_tampered"
        ? "bad"
        : finalTrustJudgement === "inconsistent_or_suspicious" ||
            finalTrustJudgement === "provisionally_signed"
          ? "warn"
          : "info";

  const bullets = buildReasonBullets(evalResult, mfst, exif, file);
  const bulletItems = bullets
    .map(
      (b) =>
        `<li class="reason-item"><span class="r-dot ${BULLET_TYPE_CLASS[b.type] ?? "r-neutral"}"></span><span>${esc(b.text)}</span></li>`,
    )
    .join("");

  // Accordion content: full trust profile + raw details
  const detailHTML =
    buildTrustProfileHTML(evalResult, sr) +
    buildDetailSections(file, mfst, exif, evalResult, sr);

  // Seal: shield/circle with the image clipped inside
  const seal = makeEmblemWithImage(evalResult, dataURL, 56);

  // Side checks
  const checks = sr?.checkGrid ?? [];
  const { left: leftChecks, right: rightChecks } = buildSideChecksHTML(checks);

  // Forensic tabs (pass evalResult so metadata AI tags appear in AI Detection panel)
  const forensicHTML = buildForensicTabsHTML(forensics, evalResult);

  const reportEl = document.getElementById("report");
  reportEl.innerHTML = `
    <div class="rpt-card">

      <!-- ── Main board ──────────────────────────────────────────────────── -->
      <div class="rpt-board">

        <!-- Top: verdict + file info -->
        <div class="rpt-board-hd">
          <div class="rpt-verdict-pill">
            <span class="rpt-vdot ${colorClass}"></span>
            <span class="rpt-vtxt ${colorClass}">${esc(TRUST_LABELS[finalTrustJudgement] || finalTrustJudgement)}</span>
          </div>
          <span class="rpt-board-file">${esc(file.name)} &nbsp;·&nbsp; ${(file.size / 1024).toFixed(1)} KB &nbsp;·&nbsp; ${esc(file.type || "unknown")}</span>
        </div>

        <!-- Body: checks | image | checks -->
        <div class="rpt-board-body">

          <!-- Left checks: Provenance & Credentials -->
          <div class="rpt-checks rpt-checks-l">
            <div class="rpt-checks-hdr">Provenance &amp; Credentials</div>
            ${leftChecks}
          </div>

          <!-- Center: image -->
          <div class="rpt-image-stage">
            <img class="rpt-focal-img" src="${esc(dataURL)}" alt="${esc(file.name)}">
          </div>

          <!-- Right checks: Metadata & Content -->
          <div class="rpt-checks rpt-checks-r">
            <div class="rpt-checks-hdr">Metadata &amp; Content</div>
            ${rightChecks}
          </div>

        </div><!-- /rpt-board-body -->

        <!-- Footer: seal + dimension badges + reset -->
        <div class="rpt-board-ft">
          <div class="rpt-seal">${seal}</div>
          <div class="rpt-dim-badges">
            <span class="rpt-dim-badge rpt-dim-badge-${provSt}">${STATUS_ICON[provSt] ?? STATUS_ICON.neutral}<span>${esc(shortProvenance(provenanceStatus))}</span></span>
            <span class="rpt-dim-badge rpt-dim-badge-${contSt}">${STATUS_ICON[contSt] ?? STATUS_ICON.neutral}<span>${esc(shortContent(contentEditStatus))}</span></span>
            <span class="rpt-dim-badge rpt-dim-badge-${metaSt}">${STATUS_ICON[metaSt] ?? STATUS_ICON.neutral}<span>${esc(shortMetadata(metadataSupportStatus))}</span></span>
            <span class="rpt-dim-badge rpt-dim-badge-${trustSt}">${STATUS_ICON[trustSt] ?? STATUS_ICON.neutral}<span>${esc(shortTrust(finalTrustJudgement))}</span></span>
          </div>
          <button class="btn rpt-new-btn" id="rstBtn">↺ New image</button>
        </div>

      </div><!-- /rpt-board -->

      <!-- ── Forensic tabs ──────────────────────────────────────────── -->
      ${forensicHTML}

      <!-- Expandable full analysis -->
      <button class="acc-toggle" id="accBtn">
        <span class="acc-label"><span class="acc-icon"></span>View full analysis &amp; raw data</span>
        <span class="chevron">▼</span>
      </button>
      <div class="acc-body" id="accBody">${detailHTML}</div>

    </div>`;

  reportEl.classList.add("on");

  document.getElementById("accBtn").addEventListener("click", function () {
    this.classList.toggle("open");
    document.getElementById("accBody").classList.toggle("open");
  });

  document.getElementById("rstBtn").addEventListener("click", () => {
    _clearGuide();
    onReset();
  });

  // Tab switching for forensic panels
  const fTabsEl = document.getElementById("forensicTabs");
  if (fTabsEl) {
    fTabsEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".ftab");
      if (!btn) return;
      const target = btn.dataset.target;
      fTabsEl
        .querySelectorAll(".ftab")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".ftab-panel").forEach((p) => {
        p.classList.toggle("active", p.id === target);
      });
    });
  }

  _updateGuide(finalTrustJudgement, contentEditStatus, dataURL);
  reportEl.scrollIntoView({ behavior: "smooth", block: "start" });
}

function shortProvenance(s) {
  switch (s) {
    case "c2pa_fully_verified":
      return "C2PA Verified";
    case "c2pa_signed_unverified_cert":
      return "Signed (Unverified Cert)";
    case "c2pa_tampered":
      return "Tampered";
    case "c2pa_invalid":
      return "Invalid";
    case "no_c2pa":
      return "No C2PA";
    // Legacy aliases
    case "c2pa_verified":
      return "C2PA Verified";
    case "c2pa_invalid_or_tampered":
      return "Invalid / Tampered";
    default:
      return "Unknown";
  }
}
function shortContent(s) {
  switch (s) {
    case "original_or_camera_capture":
      return "Original Capture";
    case "disclosed_edits":
      return "Disclosed Edits";
    case "ai_generated":
      return "AI / Synthetic";
    case "ai_generated_or_synthetic":
      return "AI / Synthetic"; // legacy
    case "suspected_undisclosed_editing":
      return "Undisclosed Edits";
    default:
      return "Unknown";
  }
}
function shortMetadata(s) {
  switch (s) {
    case "metadata_supports_claim":
      return "Consistent";
    case "metadata_inconsistent":
      return "Inconsistent";
    case "metadata_missing_or_stripped":
      return "Missing / Stripped";
    case "metadata_not_useful":
      return "Present, Limited";
    default:
      return "Unknown";
  }
}
function shortTrust(s) {
  return TRUST_LABELS[s] || s;
}

function formatProvenanceStatus(status) {
  switch (status) {
    case "c2pa_fully_verified":
      return "C2PA Fully Verified";
    case "c2pa_signed_unverified_cert":
      return "C2PA Signed (Unverified Certificate)";
    case "c2pa_tampered":
      return "C2PA Tampered";
    case "c2pa_invalid":
      return "C2PA Invalid";
    case "no_c2pa":
      return "No C2PA Found";
    // Legacy aliases
    case "c2pa_verified":
      return "C2PA Verified";
    case "c2pa_invalid_or_tampered":
      return "C2PA Invalid/Tampered";
    default:
      return "Unknown";
  }
}

function formatContentEditStatus(status) {
  switch (status) {
    case "original_or_camera_capture":
      return "Original Camera Capture";
    case "disclosed_edits":
      return "Disclosed Edits";
    case "ai_generated":
      return "AI/Synthetic Generated";
    case "ai_generated_or_synthetic":
      return "AI/Synthetic Generated"; // legacy
    case "suspected_undisclosed_editing":
      return "Suspected Undisclosed Editing";
    default:
      return "Unknown";
  }
}

function formatMetadataSupportStatus(status) {
  switch (status) {
    case "metadata_supports_claim":
      return "Metadata Supports Claim";
    case "metadata_inconsistent":
      return "Metadata Inconsistent";
    case "metadata_missing_or_stripped":
      return "Metadata Missing/Stripped";
    case "metadata_not_useful":
      return "Metadata Not Useful for Provenance";
    default:
      return "Unknown";
  }
}

function formatTrustJudgement(status) {
  return TRUST_LABELS[status] || status;
}

function getTrustColourClass(status) {
  return TRUST_COLORS[status] || "cgrey";
}

/** Remove all analysis-injected elements from the guide cards. */
function _clearGuide() {
  document.querySelectorAll(".gc").forEach((el) => {
    el.classList.remove("gc-active");
    el.querySelectorAll(".gc-injected").forEach((n) => n.remove());
  });
}

/**
 * Highlight the matching guide card and clip the analyzed image inside its shape.
 * Requires index.html to have data-trust attributes on each .gc element.
 */
function _updateGuide(finalTrustJudgement, contentEditStatus, dataURL) {
  _clearGuide();

  // Map result to guide category
  let cat;
  if (
    contentEditStatus === "ai_generated" ||
    contentEditStatus === "ai_generated_or_synthetic"
  )
    cat = "ai";
  else if (finalTrustJudgement === "strong_provenance") cat = "verified";
  else if (
    finalTrustJudgement === "verified_with_disclosed_edits" ||
    finalTrustJudgement === "inconsistent_or_suspicious"
  )
    cat = "edited";
  else if (finalTrustJudgement === "limited_evidence") cat = "camera";
  else cat = "unknown";

  const target = document.querySelector(`.gc[data-trust="${cat}"]`);
  if (!target || !dataURL) return;
  target.classList.add("gc-active");

  const svg = target.querySelector("svg");
  if (!svg) return;

  const uid = `gci${Math.random().toString(36).slice(2, 9)}`;

  // Ensure <defs> exists
  let defs = svg.querySelector("defs");
  if (!defs) {
    defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    defs.classList.add("gc-injected");
    svg.insertBefore(defs, svg.firstChild);
  }

  // Build clip shape + image bounds per category
  let clipChild, ix, iy, iw, ih;

  if (cat === "verified" || cat === "edited" || cat === "ai") {
    // Shield in 64×72 viewBox
    clipChild = document.createElementNS("http://www.w3.org/2000/svg", "path");
    clipChild.setAttribute(
      "d",
      "M32,6 L54,16 L54,36 Q54,52 32,62 Q10,52 10,36 L10,16 Z",
    );
    ix = 10;
    iy = 6;
    iw = 44;
    ih = 56;
  } else if (cat === "camera") {
    // Camera body rect in 64×72 viewBox: x=8, y=18, w=48, h=34
    clipChild = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    clipChild.setAttribute("x", "8");
    clipChild.setAttribute("y", "18");
    clipChild.setAttribute("width", "48");
    clipChild.setAttribute("height", "34");
    clipChild.setAttribute("rx", "5");
    ix = 8;
    iy = 18;
    iw = 48;
    ih = 34;
  } else {
    // Circle in 64×72 viewBox: cx=32, cy=32, r=24
    clipChild = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle",
    );
    clipChild.setAttribute("cx", "32");
    clipChild.setAttribute("cy", "32");
    clipChild.setAttribute("r", "24");
    ix = 8;
    iy = 8;
    iw = 48;
    ih = 48;
  }

  const clipPath = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "clipPath",
  );
  clipPath.setAttribute("id", uid);
  clipPath.classList.add("gc-injected");
  clipPath.appendChild(clipChild);
  defs.appendChild(clipPath);

  // Create image element
  const imgEl = document.createElementNS("http://www.w3.org/2000/svg", "image");
  imgEl.setAttribute("href", dataURL);
  imgEl.setAttribute("x", String(ix));
  imgEl.setAttribute("y", String(iy));
  imgEl.setAttribute("width", String(iw));
  imgEl.setAttribute("height", String(ih));
  imgEl.setAttribute("preserveAspectRatio", "xMidYMid slice");
  imgEl.setAttribute("clip-path", `url(#${uid})`);
  imgEl.setAttribute("opacity", "0.78");
  imgEl.classList.add("gc-injected");

  // Insert after the first background shape
  const firstShape = svg.querySelector("path, rect, circle");
  if (firstShape?.nextSibling) {
    svg.insertBefore(imgEl, firstShape.nextSibling);
  } else {
    svg.appendChild(imgEl);
  }
}
