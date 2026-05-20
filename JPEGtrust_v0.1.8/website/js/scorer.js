// ─────────────────────────────────────────────────────────────
// scorer.js — Trust evidence scoring (multi-dimensional framework)
//
// Returns: { evidence, signals, checkGrid, authenticityScore }
//
// evidence — structured rows for the emblem card:
//   [{ label, value, status }]
//   status: 'ok' | 'warn' | 'bad' | 'neutral' | 'info' | 'purple'
//
// signals — plain audit log for the accordion:
//   [{ text, status }]
//
// checkGrid — pass/fail/warn/info/na check items:
//   [{ id, label, detail, status }]
//   status: 'pass' | 'fail' | 'warn' | 'info' | 'na'
//
// authenticityScore — integer 0–100
//
// Provenance status values (from classifier.js):
//   c2pa_fully_verified         — valid sig, trusted cert, no mismatch
//   c2pa_signed_unverified_cert — valid sig, content intact, cert not in trust store
//   c2pa_tampered               — content hash mismatch (actual tampering)
//   c2pa_invalid                — bad signature or revoked cert
//   no_c2pa                     — no manifest present
//
// Final trust judgement values:
//   strong_provenance | verified_with_disclosed_edits | provisionally_signed
//   limited_evidence | inconsistent_or_suspicious | tampered
//   invalid_provenance | insufficient_evidence
// ─────────────────────────────────────────────────────────────
import { evaluateImage } from "./classifier.js";
import { DST, ACTIONS, EDIT_SW } from "./data.js";
import {
  getActiveManifest,
  getValidationStatus,
  getValidationResults,
  getActions,
  getAssertions,
  getDST,
  claimGen,
  getSigInfo,
  fmtDate,
} from "./helpers.js";

// ─── Public export ────────────────────────────────────────────────────────────

export function computeScore(file, sdk, Exifr) {
  return _computeScoreInternal(file, sdk, Exifr);
}

// ─── Main async pipeline ──────────────────────────────────────────────────────

/**
 * Read EXIF + C2PA data, run evaluation, build all output layers.
 * @param {File}   file
 * @param {object} sdk
 * @param {object} Exifr
 * @returns {Promise<{evidence, signals, checkGrid, authenticityScore}>}
 */
async function _computeScoreInternal(file, sdk, Exifr) {
  const [exif, mfstRaw] = await Promise.all([
    _readExif(file, Exifr),
    _readManifest(file, sdk),
  ]);

  const mfst = mfstRaw.data;
  const error = mfstRaw.error;

  const evalResult = evaluateImage(mfst, exif, file);
  const { metadata } = evalResult;

  const evidence = buildEvidenceRows(evalResult, mfst, exif);
  const signals = buildAuditSignals(evalResult, mfst, exif, error);
  const checkGrid = buildCheckGrid(evalResult, mfst, exif);
  const authenticityScore = metadata.authenticityScore ?? 0;

  return { evidence, signals, checkGrid, authenticityScore };
}

// ─── Evidence rows ────────────────────────────────────────────────────────────

/**
 * Build the summary evidence row array displayed in the emblem card.
 * @param {object} evalResult
 * @param {object|null} mfst
 * @param {object} exif
 * @returns {Array<{label:string, value:string, status:string}>}
 */
function buildEvidenceRows(evalResult, mfst, exif) {
  const {
    provenanceStatus,
    contentEditStatus,
    metadataSupportStatus,
    finalTrustJudgement,
    metadata,
  } = evalResult;

  const evidence = [];

  // ── Row 1: Provenance source ───────────────────────────────────────────────
  switch (provenanceStatus) {
    case "c2pa_fully_verified":
      evidence.push({
        label: "Provenance source",
        value: "C2PA manifest — signature valid, certificate trusted",
        status: "ok",
      });
      break;
    case "c2pa_signed_unverified_cert":
      evidence.push({
        label: "Provenance source",
        value:
          "C2PA manifest — signature valid, certificate not in trust store (self-signed / pre-production)",
        status: "warn",
      });
      break;
    case "c2pa_tampered":
      evidence.push({
        label: "Provenance source",
        value:
          "C2PA manifest present — content hash mismatch detected (image modified after signing)",
        status: "bad",
      });
      break;
    case "c2pa_invalid":
      evidence.push({
        label: "Provenance source",
        value: metadata.certRevoked
          ? "C2PA manifest present — signing certificate has been revoked"
          : "C2PA manifest present — signature could not be validated",
        status: "bad",
      });
      break;
    case "no_c2pa":
    default:
      evidence.push({
        label: "Provenance source",
        value: "No C2PA manifest found",
        status: "neutral",
      });
      break;
  }

  // ── Row 2: Content / edit status ──────────────────────────────────────────
  switch (contentEditStatus) {
    case "original_or_camera_capture":
      evidence.push({
        label: "Content assessment",
        value:
          "Image appears to be an original camera capture — no editing actions declared",
        status: "ok",
      });
      break;
    case "disclosed_edits":
      evidence.push({
        label: "Content assessment",
        value:
          "Edits disclosed in C2PA manifest — transparent and common in professional workflows",
        status: "info",
      });
      break;
    case "ai_generated": {
      const active = getActiveManifest(mfst);
      const dstKey = active ? getDST(active)?.split("/").pop() : null;
      const dstLabel = dstKey && DST[dstKey] ? DST[dstKey].label : "AI system";
      evidence.push({
        label: "Content assessment",
        value: `AI/synthetic origin declared — ${dstLabel}`,
        status: "purple",
      });
      break;
    }
    case "suspected_undisclosed_editing":
      evidence.push({
        label: "Content assessment",
        value: `Editing software detected in EXIF (${metadata.editingSoftware ?? "unknown"}) — no provenance disclosure`,
        status: "warn",
      });
      break;
    default:
      evidence.push({
        label: "Content assessment",
        value: "Content status could not be determined",
        status: "neutral",
      });
      break;
  }

  // ── Row 3: Metadata consistency ────────────────────────────────────────────
  switch (metadataSupportStatus) {
    case "metadata_supports_claim":
      evidence.push({
        label: "Metadata consistency",
        value: "EXIF metadata consistent with C2PA provenance claims",
        status: "ok",
      });
      break;
    case "metadata_inconsistent":
      evidence.push({
        label: "Metadata consistency",
        value:
          "EXIF metadata contradicts C2PA provenance claims — review required",
        status: "warn",
      });
      break;
    case "metadata_missing_or_stripped":
      evidence.push({
        label: "Metadata consistency",
        value: "No useful metadata found for provenance assessment",
        status: "neutral",
      });
      break;
    case "metadata_not_useful":
    default:
      evidence.push({
        label: "Metadata consistency",
        value:
          "Metadata present but not sufficient to establish provenance independently",
        status: "info",
      });
      break;
  }

  // ── Row 4: Final trust judgement ───────────────────────────────────────────
  switch (finalTrustJudgement) {
    case "strong_provenance":
      evidence.push({
        label: "Trust assessment",
        value:
          "Strong provenance evidence — image appears authentic and unaltered",
        status: "ok",
      });
      break;
    case "verified_with_disclosed_edits":
      evidence.push({
        label: "Trust assessment",
        value:
          "Verified provenance with disclosed edits — transparent and legitimate workflow",
        status: "ok",
      });
      break;
    case "provisionally_signed":
      evidence.push({
        label: "Trust assessment",
        value:
          "Provisionally signed — cryptographic signature is valid and content is intact, but certificate is not in the SDK trust store",
        status: "warn",
      });
      break;
    case "limited_evidence":
      evidence.push({
        label: "Trust assessment",
        value:
          "Limited evidence — camera EXIF present, but no cryptographic provenance",
        status: "info",
      });
      break;
    case "inconsistent_or_suspicious":
      evidence.push({
        label: "Trust assessment",
        value:
          "Inconsistent evidence — C2PA claims contradict EXIF metadata; requires further investigation",
        status: "warn",
      });
      break;
    case "tampered":
      evidence.push({
        label: "Trust assessment",
        value:
          "Tampered — content was modified after signing; provenance chain is broken",
        status: "bad",
      });
      break;
    case "invalid_provenance":
      evidence.push({
        label: "Trust assessment",
        value: metadata.certRevoked
          ? "Invalid provenance — signing certificate has been revoked"
          : "Invalid provenance — signature verification failed",
        status: "bad",
      });
      break;
    case "insufficient_evidence":
    default:
      evidence.push({
        label: "Trust assessment",
        value:
          "Insufficient evidence — origin, creation time, and editing history cannot be determined",
        status: "neutral",
      });
      break;
  }

  return evidence;
}

// ─── Check grid ───────────────────────────────────────────────────────────────

/**
 * Build the structured check-grid array.
 *
 * Each item: { id, label, detail, status: 'pass'|'fail'|'warn'|'info'|'na' }
 *
 * Checks:
 *   1.  content_credentials    — C2PA manifest present?
 *   2.  signature_valid        — cryptographic signature OK?
 *   3.  cert_trusted           — certificate in SDK trust store?
 *   4.  content_integrity      — content hash intact (no mismatch)?
 *   5.  camera_metadata        — EXIF Make/Model present?
 *   6.  editing_software       — known editing software detected?
 *   7.  timestamp_consistency  — EXIF timestamps consistent?
 *   8.  ai_origin              — AI/synthetic origin declared?
 *   9.  gps_data               — GPS location embedded?
 *   10. metadata_completeness  — breadth of EXIF fields present?
 *
 * @param {object} evalResult
 * @param {object|null} mfst
 * @param {object} exif
 * @returns {Array<{id:string, label:string, detail:string, status:string}>}
 */
function buildCheckGrid(evalResult, mfst, exif) {
  const { provenanceStatus, metadata } = evalResult;
  const ex = exif ?? {};

  const {
    hasC2pa,
    sigOK,
    certTrusted,
    certUntrusted,
    certRevoked,
    contentMismatch,
    isAI,
    timestampConsistency,
    editingSoftware,
    hasCamera,
    hasTimestamp,
    hasGPS,
    aiGeneratorTags = [],
    xmpPresent = false,
  } = metadata;

  const grid = [];

  // ── 1. Content Credentials (C2PA manifest present) ─────────────────────────
  grid.push({
    id: "content_credentials",
    label: "Content Credentials (C2PA)",
    detail: hasC2pa
      ? "A C2PA manifest was found and parsed successfully."
      : "No C2PA manifest is embedded in this image.",
    status: hasC2pa ? "pass" : "na",
  });

  // ── 2. Signature Valid ─────────────────────────────────────────────────────
  if (!hasC2pa) {
    grid.push({
      id: "signature_valid",
      label: "Signature Valid",
      detail: "Not applicable — no C2PA manifest present.",
      status: "na",
    });
  } else if (sigOK) {
    grid.push({
      id: "signature_valid",
      label: "Signature Valid",
      detail:
        "The cryptographic signature on the C2PA claim was successfully verified.",
      status: "pass",
    });
  } else {
    grid.push({
      id: "signature_valid",
      label: "Signature Valid",
      detail:
        "The cryptographic signature could not be verified — the manifest may have been corrupted or forged.",
      status: "fail",
    });
  }

  // ── 3. Certificate Trusted ─────────────────────────────────────────────────
  if (!hasC2pa) {
    grid.push({
      id: "cert_trusted",
      label: "Certificate Trusted",
      detail: "Not applicable — no C2PA manifest present.",
      status: "na",
    });
  } else if (certRevoked) {
    grid.push({
      id: "cert_trusted",
      label: "Certificate Trusted",
      detail:
        "The signing certificate has been explicitly revoked and is no longer valid.",
      status: "fail",
    });
  } else if (certTrusted) {
    grid.push({
      id: "cert_trusted",
      label: "Certificate Trusted",
      detail: "The signing certificate is present in the SDK trust store.",
      status: "pass",
    });
  } else if (certUntrusted) {
    grid.push({
      id: "cert_trusted",
      label: "Certificate Trusted",
      detail:
        "The certificate is not in the SDK trust store — likely self-signed or a pre-production cert. The signature itself is still cryptographically valid.",
      status: "warn",
    });
  } else {
    grid.push({
      id: "cert_trusted",
      label: "Certificate Trusted",
      detail: "Certificate trust status could not be determined.",
      status: "warn",
    });
  }

  // ── 4. Content Integrity ───────────────────────────────────────────────────
  if (!hasC2pa) {
    grid.push({
      id: "content_integrity",
      label: "Content Integrity",
      detail: "Not applicable — no C2PA manifest to verify against.",
      status: "na",
    });
  } else if (contentMismatch) {
    grid.push({
      id: "content_integrity",
      label: "Content Integrity",
      detail:
        "Content hash mismatch — the image bytes were modified after the C2PA signature was applied.",
      status: "fail",
    });
  } else {
    grid.push({
      id: "content_integrity",
      label: "Content Integrity",
      detail:
        "Content hashes match — the image has not been modified since signing.",
      status: "pass",
    });
  }

  // ── 5. XMP Metadata ────────────────────────────────────────────────────
  grid.push({
    id: "xmp_metadata",
    label: "XMP Metadata",
    detail: xmpPresent
      ? "XMP metadata block is present in this file."
      : "No XMP metadata block found in this file.",
    status: xmpPresent ? "pass" : "na",
  });

  // ── (right panel starts here — indices 5-9) ───────────────────────────────

  // ── 6. Camera Metadata ───────────────────────────────────────────────────
  const cameraMake = ex.Make ?? ex.make ?? "";
  const cameraModel = ex.Model ?? ex.model ?? "";
  if (hasCamera) {
    grid.push({
      id: "camera_metadata",
      label: "Camera Metadata",
      detail: `Camera identified: ${[cameraMake, cameraModel].filter(Boolean).join(" ")}.`,
      status: "pass",
    });
  } else {
    grid.push({
      id: "camera_metadata",
      label: "Camera Metadata",
      detail:
        "No camera Make or Model in EXIF — metadata may have been stripped.",
      status: "fail",
    });
  }

  // ── 7. Editing Software Traces ──────────────────────────────────────────
  if (editingSoftware) {
    grid.push({
      id: "editing_software",
      label: "Editing Software",
      detail: `Known editing tool detected: “${editingSoftware}”.`,
      status: "warn",
    });
  } else {
    grid.push({
      id: "editing_software",
      label: "Editing Software",
      detail: "No known editing software detected in EXIF.",
      status: "pass",
    });
  }

  // ── 8. Timestamp Consistency — already computed above ───────────────────────
  switch (timestampConsistency) {
    case "consistent":
      grid.push({
        id: "timestamp_consistency",
        label: "Timestamp Consistency",
        detail: "EXIF timestamps are consistent — no significant gap detected.",
        status: "pass",
      });
      break;
    case "gap_detected":
      grid.push({
        id: "timestamp_consistency",
        label: "Timestamp Consistency",
        detail:
          "Significant gap (>48 h) between EXIF timestamps — file may have been re-saved after capture.",
        status: "warn",
      });
      break;
    default:
      grid.push({
        id: "timestamp_consistency",
        label: "Timestamp Consistency",
        detail: "Insufficient timestamp data to compare.",
        status: "na",
      });
  }

  // ── 9. AI Generator Tags (metadata) ───────────────────────────────────────
  if (aiGeneratorTags.length > 0) {
    grid.push({
      id: "ai_generator_tags",
      label: "AI Generator Tags",
      detail: `AI generation evidence found in metadata: ${aiGeneratorTags.slice(0, 2).join("; ")}.`,
      status: "warn",
    });
  } else if (isAI) {
    const active = getActiveManifest(mfst);
    const dstKey = active ? getDST(active)?.split("/").pop() : null;
    const dstLabel = dstKey && DST[dstKey] ? DST[dstKey].label : "AI/synthetic";
    grid.push({
      id: "ai_generator_tags",
      label: "AI Generator Tags",
      detail: `AI/synthetic origin declared via C2PA: ${dstLabel}.`,
      status: "info",
    });
  } else {
    grid.push({
      id: "ai_generator_tags",
      label: "AI Generator Tags",
      detail: "No AI generator tags detected in metadata or C2PA manifest.",
      status: "pass",
    });
  }

  // ── 10. Metadata Completeness ──────────────────────────────────────────────
  const CF = [
    "Make",
    "Model",
    "DateTimeOriginal",
    "ExposureTime",
    "FNumber",
    "ISOSpeedRatings",
    "FocalLength",
    "LensModel",
    "GPSLatitude",
    "Software",
    "ColorSpace",
    "PixelXDimension",
  ];
  const presentCount = CF.filter((f) => ex[f] != null).length;
  const total = CF.length;

  if (presentCount >= 7) {
    grid.push({
      id: "metadata_completeness",
      label: "Metadata Completeness",
      detail: `Rich EXIF — ${presentCount}/${total} common fields present.`,
      status: "pass",
    });
  } else if (presentCount >= 3) {
    grid.push({
      id: "metadata_completeness",
      label: "Metadata Completeness",
      detail: `Partial EXIF — ${presentCount}/${total} common fields present.`,
      status: "warn",
    });
  } else {
    grid.push({
      id: "metadata_completeness",
      label: "Metadata Completeness",
      detail: `Sparse EXIF — only ${presentCount}/${total} fields found. Metadata may have been stripped.`,
      status: "fail",
    });
  }

  return grid;
}

// ─── Audit signals ────────────────────────────────────────────────────────────

/**
 * Build the ordered audit-log signal array for the accordion/detail view.
 * @param {object}      evalResult
 * @param {object|null} mfst
 * @param {object}      exif
 * @param {string|null} error
 * @returns {Array<{text:string, status:string}>}
 */
function buildAuditSignals(evalResult, mfst, exif, error) {
  const signals = [];
  const note = (text, status = "neutral") => signals.push({ text, status });

  const {
    provenanceStatus,
    contentEditStatus,
    metadataSupportStatus,
    finalTrustJudgement,
    metadata,
  } = evalResult;

  const {
    hasC2pa,
    sigOK,
    certTrusted,
    certUntrusted,
    certRevoked,
    contentMismatch,
    isAI,
    timestampConsistency,
    editingSoftware,
    hasCamera,
    hasTimestamp,
    hasGPS,
  } = metadata;

  const active = getActiveManifest(mfst);
  const ex = exif ?? {};

  // ── C2PA section ───────────────────────────────────────────────────────────
  if (hasC2pa) {
    note("C2PA manifest found and parsed", "ok");

    // Provenance status narrative
    switch (provenanceStatus) {
      case "c2pa_fully_verified":
        note(
          "Signature cryptographically validated — certificate is in the SDK trust store",
          "ok",
        );
        break;
      case "c2pa_signed_unverified_cert":
        note("Signature cryptographically validated — content is intact", "ok");
        note(
          "Certificate is NOT in the SDK trust store — this is expected for self-signed or pre-production certs and does NOT indicate tampering",
          "warn",
        );
        break;
      case "c2pa_tampered":
        note(
          "⚠ Content hash mismatch — the image was modified after the C2PA manifest was signed",
          "bad",
        );
        break;
      case "c2pa_invalid":
        if (certRevoked) {
          note("⚠ Signing certificate has been explicitly revoked", "bad");
        }
        if (!sigOK) {
          note(
            "⚠ Cryptographic signature verification failed — manifest may be corrupted or forged",
            "bad",
          );
        }
        break;
    }

    // Signer and generator details
    if (active) {
      const si = getSigInfo(active);
      if (si.issuer) {
        note(
          `Signed by: ${si.issuer}${si.time ? " on " + fmtDate(si.time) : ""}`,
          sigOK ? "ok" : "warn",
        );
      }
      const cg = claimGen(active);
      if (cg) note(`Created/processed by: ${cg}`, "ok");

      // Provenance chain depth
      const allManifestKeys = Object.keys(mfst?.manifests ?? {});
      if (allManifestKeys.length > 1) {
        note(
          `Provenance chain: ${allManifestKeys.length} signing events recorded`,
          "ok",
        );
      }

      // Ingredients
      const ings = active?.ingredients ?? [];
      if (ings.length) {
        note(
          `${ings.length} ingredient(s) referenced in provenance chain`,
          "ok",
        );
      }

      // Actions summary
      const acts = getActions(active);
      if (acts.length > 0) {
        const critical = acts.filter(
          (a) => ACTIONS[a.action]?.risk === "critical",
        );
        const high = acts.filter((a) => ACTIONS[a.action]?.risk === "high");
        const moderate = acts.filter(
          (a) => ACTIONS[a.action]?.risk === "moderate",
        );

        if (critical.length > 0) {
          critical.forEach((a) =>
            note(
              `Critical action declared: ${ACTIONS[a.action]?.label ?? a.action}${a.description ? " — " + a.description : ""}`,
              "warn",
            ),
          );
        }
        if (high.length > 0) {
          high.forEach((a) =>
            note(
              `High-impact edit declared: ${ACTIONS[a.action]?.label ?? a.action}${a.description ? " — " + a.description : ""}`,
              "warn",
            ),
          );
        }
        if (moderate.length > 0) {
          moderate.forEach((a) =>
            note(
              `Moderate edit declared: ${ACTIONS[a.action]?.label ?? a.action}${a.description ? " — " + a.description : ""}`,
              "info",
            ),
          );
        }
        if (
          critical.length === 0 &&
          high.length === 0 &&
          moderate.length === 0
        ) {
          note(
            `${acts.length} action(s) in edit history — all are low-risk`,
            "ok",
          );
        }
      }

      // AI origin
      if (isAI) {
        const dstKey = getDST(active)?.split("/").pop();
        note("AI or synthetic origin declared in C2PA manifest", "info");
        if (dstKey && DST[dstKey]) {
          note(`Digital source type: ${DST[dstKey].label}`, "info");
        }
      }
    }
  } else {
    note("No C2PA manifest found — evaluating EXIF metadata only", "neutral");
  }

  // ── EXIF section ───────────────────────────────────────────────────────────
  const cameraMake = ex.Make ?? ex.make ?? "";
  const cameraModel = ex.Model ?? ex.model ?? "";

  if (hasCamera) {
    note(
      `Camera identified: ${[cameraMake, cameraModel].filter(Boolean).join(" ")}`,
      "info",
    );
  } else if (!hasC2pa) {
    note(
      "No camera Make or Model in EXIF — provenance cannot be linked to a capture device",
      "neutral",
    );
  }

  if (hasTimestamp) {
    const raw = ex.DateTimeOriginal ?? ex.dateTimeOriginal;
    const d = raw instanceof Date ? raw.toLocaleString() : String(raw);
    note(`Capture timestamp (EXIF): ${d}`, "info");
  }

  if (timestampConsistency === "gap_detected") {
    note(
      "Timestamp gap detected: EXIF DateTimeOriginal and ModifyDate/DateTime differ by more than 48 hours — file may have been re-saved after capture",
      "warn",
    );
  }

  if (hasGPS) {
    note("GPS location data embedded in EXIF", "info");
  }

  if (editingSoftware) {
    note(`Editing software detected in EXIF: ${editingSoftware}`, "warn");
  }

  // EXIF trust caveat
  if (!hasC2pa && (hasCamera || hasTimestamp || hasGPS || editingSoftware)) {
    note(
      "EXIF metadata is self-reported and not cryptographically signed — treat as informational only",
      "warn",
    );
  }

  // EXIF contradicts C2PA
  if (metadataSupportStatus === "metadata_inconsistent") {
    note(
      "EXIF metadata contradicts C2PA claims — treating verified C2PA data as the stronger evidence source",
      "warn",
    );
  }

  // ── Parse error ────────────────────────────────────────────────────────────
  if (error && !mfst) {
    note(`C2PA parse error: ${String(error).slice(0, 120)}`, "bad");
  }

  // ── Sparse metadata note ───────────────────────────────────────────────────
  if (!hasC2pa && !hasCamera && !hasTimestamp && !hasGPS) {
    note("No significant EXIF metadata found", "neutral");
    note(
      "Origin, creation time, and editing history cannot be determined",
      "neutral",
    );
    note(
      "This does not imply inauthenticity — many legitimate images carry no provenance data",
      "neutral",
    );
  }

  return signals;
}

// ─── I/O helpers ──────────────────────────────────────────────────────────────

/**
 * Read EXIF from a File using exifr.
 * @param {File}   file
 * @param {object} Exifr
 * @returns {Promise<object>}
 */
async function _readExif(file, Exifr) {
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
 * Read the C2PA manifest store, guarded against WASM failures.
 * @param {File}   file
 * @param {object} sdk
 * @returns {Promise<{data:object|null, error:string|null}>}
 */
async function _readManifest(file, sdk) {
  if (!sdk) return { data: null, error: "SDK not available" };

  let reader = null;
  try {
    reader = await sdk.reader.fromBlob(file.type, file);
    if (!reader || typeof reader.manifestStore !== "function") {
      return { data: null, error: null };
    }
    const raw = await reader.manifestStore();
    let data = raw ? _safeJSON(raw) : null;
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

/**
 * Safely parse JSON, handling Uint8Array payloads.
 * @param {string|Uint8Array} json
 * @returns {object|null}
 */
function _safeJSON(json) {
  try {
    return JSON.parse(json, (_, v) =>
      v instanceof Uint8Array ? "[binary]" : v,
    );
  } catch {
    return null;
  }
}
