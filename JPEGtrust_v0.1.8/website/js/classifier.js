// ─────────────────────────────────────────────────────────────
// classifier.js — multi-dimensional trust evaluation framework
//
// Provenance status values:
//   c2pa_fully_verified       — valid sig, trusted cert, no content mismatch, no revocation
//   c2pa_signed_unverified_cert — valid sig, content intact, cert not in SDK trust store
//   c2pa_tampered             — content hash / data mismatch (image modified after signing)
//   c2pa_invalid              — signature invalid OR cert explicitly revoked
//   no_c2pa                   — no manifest present
//
// Content/edit status values:
//   original_or_camera_capture
//   disclosed_edits
//   ai_generated
//   suspected_undisclosed_editing
//   unknown
//
// Final trust judgement values:
//   strong_provenance           — c2pa_fully_verified + original_or_camera_capture + consistent metadata
//   verified_with_disclosed_edits — c2pa_fully_verified + disclosed_edits or ai_generated
//   provisionally_signed        — c2pa_signed_unverified_cert (valid sig, content intact)
//   limited_evidence            — no_c2pa + has useful camera EXIF
//   inconsistent_or_suspicious  — verified C2PA but EXIF contradicts claims
//   tampered                    — c2pa_tampered (actual content modification detected)
//   invalid_provenance          — c2pa_invalid (bad sig or revoked cert)
//   insufficient_evidence       — no C2PA + no useful EXIF
// ─────────────────────────────────────────────────────────────
import { DST, ACTIONS, EDIT_SW, AI_GENERATORS } from "./data.js";
import {
  getActiveManifest,
  getValidationStatus,
  getValidationResults,
  getActions,
  getAssertions,
  getDST,
} from "./helpers.js";

// ─── Timestamp parsing helpers ────────────────────────────────────────────────

/**
 * Coerce an EXIF date value into a JS Date, or null on failure.
 * Handles Date objects, ISO strings, and the "YYYY:MM:DD HH:MM:SS" EXIF format.
 * @param {*} val
 * @returns {Date|null}
 */
function parseExifDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const s = String(val).trim();
  // EXIF canonical form: "2024:06:15 14:30:00"
  const exifMatch = s.match(
    /^(\d{4}):(\d{2}):(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/,
  );
  if (exifMatch) {
    const [, yr, mo, dy, hr, mn, sc] = exifMatch;
    const d = new Date(`${yr}-${mo}-${dy}T${hr}:${mn}:${sc}`);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Compare EXIF DateTimeOriginal, ModifyDate, and DateTime fields.
 * Returns 'consistent' | 'gap_detected' | 'unavailable'.
 *
 * We define "gap" as any two present timestamps differing by more than 48 hours,
 * which strongly implies post-capture editing at the file level.
 * @param {object} exif
 * @returns {'consistent'|'gap_detected'|'unavailable'}
 */
function computeTimestampConsistency(exif) {
  if (!exif) return "unavailable";

  const original = parseExifDate(
    exif.DateTimeOriginal ?? exif.dateTimeOriginal,
  );
  const modified = parseExifDate(exif.ModifyDate ?? exif.modifyDate);
  const datetime = parseExifDate(exif.DateTime ?? exif.dateTime);

  const dates = [original, modified, datetime].filter(Boolean);
  if (dates.length < 2) return "unavailable";

  const GAP_MS = 48 * 60 * 60 * 1000; // 48 hours
  for (let i = 0; i < dates.length; i++) {
    for (let j = i + 1; j < dates.length; j++) {
      if (Math.abs(dates[i].getTime() - dates[j].getTime()) > GAP_MS) {
        return "gap_detected";
      }
    }
  }
  return "consistent";
}

/**
 * Detect editing software from EXIF Software tag.
 * Returns the raw software string if it matches a known editor, otherwise null.
 * @param {object} exif
 * @returns {string|null}
 */
function detectEditingSoftware(exif) {
  if (!exif) return null;
  const sw = (exif.Software ?? exif.software ?? "").toLowerCase().trim();
  if (!sw) return null;
  const matched = EDIT_SW.some((s) => sw.includes(s));
  return matched ? (exif.Software ?? exif.software ?? sw) : null;
}

// ─── Authenticity Score ───────────────────────────────────────────────────────

/**
 * Compute an authenticity score from 0–100 using weighted signals.
 *
 * Signal weights (additive unless noted):
 *   +8   C2PA manifest present
 *   +20  Signature cryptographically valid (sigOK)
 *   +12  Certificate in SDK trust store
 *   +10  No content mismatch   /   -35 if mismatch detected
 *   +8   Camera make/model present in EXIF
 *   +6   DateTimeOriginal present
 *   +6   Timestamps consistent (no 48 h+ gap)
 *   +5   No editing software in EXIF
 *   -8   Editing software detected
 *   +3   GPS data present
 *   +2   No AI origin declared (informational bonus)
 *   -20  Certificate revoked
 *   -15  Signature invalid
 *
 * Final value is clamped to [0, 100].
 *
 * @param {object} flags
 * @returns {number}
 */
function computeAuthenticityScore(flags) {
  const {
    hasC2pa,
    sigOK,
    certTrusted,
    certRevoked,
    contentMismatch,
    hasCamera,
    hasTimestamp,
    timestampConsistency,
    editingSoftware,
    hasGPS,
    isAI,
  } = flags;

  let score = 0;

  if (hasC2pa) score += 8;
  if (sigOK) score += 20;
  if (certTrusted) score += 12;
  if (certRevoked) score -= 20;
  if (!sigOK && hasC2pa) score -= 15; // manifest present but sig broken

  if (hasC2pa) {
    if (contentMismatch) {
      score -= 35;
    } else if (sigOK) {
      score += 10; // content intact
    }
  }

  if (hasCamera) score += 8;
  if (hasTimestamp) score += 6;
  if (timestampConsistency === "consistent") score += 6;

  if (editingSoftware) {
    score -= 8;
  } else {
    score += 5; // no known editor detected
  }

  if (hasGPS) score += 3;
  if (!isAI) score += 2; // no AI declaration bonus

  return Math.max(0, Math.min(100, score));
}

// ─── C2PA contradiction check ─────────────────────────────────────────────────

/**
 * Check whether EXIF metadata materially contradicts a verified C2PA claim.
 * Returns true only when we have both a C2PA timestamp and an EXIF timestamp
 * that diverge by more than 24 hours, or camera make/model explicitly disagrees.
 * @param {object} active  — active manifest object
 * @param {object} exif
 * @returns {boolean}
 */
function exifContradictsC2PA(active, exif) {
  if (!active || !exif) return false;

  // Timestamp comparison
  const c2paTs =
    active.timestamp ?? active.dateCreated ?? active.created ?? null;
  if (c2paTs && (exif.DateTimeOriginal || exif.dateTimeOriginal)) {
    const c2paDate = new Date(c2paTs);
    const exifDate = parseExifDate(
      exif.DateTimeOriginal ?? exif.dateTimeOriginal,
    );
    if (!isNaN(c2paDate.getTime()) && exifDate) {
      const diff = Math.abs(c2paDate.getTime() - exifDate.getTime());
      if (diff > 24 * 60 * 60 * 1000) return true;
    }
  }

  // Camera make/model comparison — only flag if both sides have a non-empty value
  const assertions = getAssertions(active);
  for (const assertion of assertions) {
    const d = assertion.data;
    if (!d) continue;
    const c2paMake = (d.cameraMake ?? d.make ?? "").toLowerCase().trim();
    const c2paModel = (d.cameraModel ?? d.model ?? "").toLowerCase().trim();
    const exifMake = (exif.Make ?? exif.make ?? "").toLowerCase().trim();
    const exifModel = (exif.Model ?? exif.model ?? "").toLowerCase().trim();

    if (c2paMake && exifMake && c2paMake !== exifMake) return true;
    if (c2paModel && exifModel && c2paModel !== exifModel) return true;
  }

  return false;
}

// ─── AI metadata tag detection ───────────────────────────────────────────────

/**
 * Scan every text-bearing EXIF/XMP/IPTC field for known AI generator names.
 * Returns an array of human-readable tag strings found, or [].
 * @param {object} exif
 * @returns {string[]}
 */
function detectAIGeneratorTags(exif) {
  if (!exif) return [];
  const tags = new Set();

  // All text fields that might carry a tool/software name
  const candidates = [
    exif.Software,
    exif.software,
    exif.CreatorTool,
    exif.creatorTool,
    exif.Artist,
    exif.artist,
    exif.ImageDescription,
    exif.imageDescription,
    exif.UserComment,
    exif.userComment,
    exif.Comment,
    exif.comment,
    exif.XMPToolkit,
    exif.xmpToolkit,
    exif.Producer,
    exif.producer,
    exif.Creator,
    exif.creator,
    exif.Copyright,
    exif.copyright,
    exif.Description,
    exif.description,
    exif.Title,
    exif.title,
    // IPTC fields
    exif.Caption,
    exif.caption,
    exif.Credit,
    exif.credit,
    exif.Source,
    exif.source,
    // XMP extended
    exif.dc_description,
    exif["dc:description"],
    exif.dc_creator,
    exif["dc:creator"],
  ].filter((v) => v != null && typeof v === "string" && v.trim().length > 0);

  for (const field of candidates) {
    const lower = field.toLowerCase();
    for (const gen of AI_GENERATORS) {
      if (lower.includes(gen.toLowerCase())) {
        tags.add(field.trim().slice(0, 80));
        break;
      }
    }
  }

  return [...tags];
}

/**
 * Detect whether XMP metadata is present.
 * exifr merges XMP into the flat output; we probe for XMP-only keys.
 * @param {object} exif
 * @returns {boolean}
 */
function detectXMPPresence(exif) {
  if (!exif) return false;
  const XMP_KEYS = [
    "CreatorTool",
    "XMPToolkit",
    "Rating",
    "Label",
    "MetadataDate",
    "CreateDate",
    "DocumentID",
    "OriginalDocumentID",
    "InstanceID",
    "RawFileName",
    "xmpMM",
    "xmpDM",
    "photoshop",
  ];
  return XMP_KEYS.some((k) => exif[k] != null);
}

// ─── AI detection ─────────────────────────────────────────────────────────────

/**
 * Returns true if the manifest store contains any AI/synthetic origin signal.
 * @param {object} mfst
 * @returns {boolean}
 */
function detectAI(mfst) {
  if (!mfst?.manifests) return false;
  return Object.values(mfst.manifests).some((m) => {
    // Action-level DST or critical-risk action
    const acts = getActions(m);
    if (
      acts.some((a) => {
        const key = a.digitalSourceType?.split("/").pop();
        return DST[key]?.ai || ACTIONS[a.action]?.risk === "critical";
      })
    )
      return true;
    // Assertion-level DST
    const dstAssertion = getAssertions(m).find(
      (x) => x.data?.digitalSourceType,
    );
    const dstKey = dstAssertion?.data?.digitalSourceType?.split("/").pop();
    return DST[dstKey]?.ai ?? false;
  });
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Evaluate an image using the multi-dimensional trust framework.
 *
 * @param {object|null} mfst — parsed C2PA manifest store (or null)
 * @param {object}      exif — parsed EXIF metadata (or {})
 * @param {File}        file — the image File object
 * @returns {object} multi-dimensional evaluation result
 */
export function evaluateImage(mfst, exif, file) {
  const ex = exif ?? {};

  // ── 1. Parse C2PA validation signals ──────────────────────────────────────
  const active = getActiveManifest(mfst);
  const hasC2pa = !!active;

  const vr = hasC2pa ? getValidationResults(mfst) : null;
  const success = vr?.success ?? [];
  const failure = vr?.failure ?? [];
  const vstatus = hasC2pa ? getValidationStatus(mfst) : [];

  // Signature validity — look in both success results AND validation_status
  const sigOK =
    success.some((v) => v.code === "claimSignature.validated") ||
    vstatus.some((v) => v.code === "claimSignature.validated");

  // Certificate NOT in SDK trust store — this does NOT mean tampering
  const certUntrusted =
    vstatus.some((v) => v.code === "signingCredential.untrusted") ||
    failure.some((v) => v.code === "signingCredential.untrusted");

  const certRevoked =
    failure.some((v) => v.code === "signingCredential.revoked") ||
    vstatus.some((v) => v.code === "signingCredential.revoked");

  // True tampering signals — content/data hash mismatch
  const contentMismatch = failure.some((v) =>
    [
      "claimSignature.mismatch",
      "assertion.hashedURI.mismatch",
      "assertion.dataHash.mismatch",
      "assertion.thumbnail.mismatch",
      "c2pHashMismatch",
    ].includes(v.code),
  );

  // Signature was explicitly broken (not just untrusted cert)
  const sigInvalid = !sigOK && hasC2pa && !certUntrusted;

  // ── 2. Provenance status ───────────────────────────────────────────────────
  let provenanceStatus;

  if (!hasC2pa) {
    provenanceStatus = "no_c2pa";
  } else if (contentMismatch) {
    // Content hash doesn't match — image was modified after signing
    provenanceStatus = "c2pa_tampered";
  } else if (certRevoked || sigInvalid) {
    // Certificate explicitly revoked, or signature cryptographically broken
    provenanceStatus = "c2pa_invalid";
  } else if (sigOK && certUntrusted) {
    // Valid signature, content intact — cert just not in SDK trust store
    // This is common with self-signed or pre-production certificates
    provenanceStatus = "c2pa_signed_unverified_cert";
  } else if (sigOK && !certUntrusted && !certRevoked) {
    provenanceStatus = "c2pa_fully_verified";
  } else {
    // Fallback: C2PA present but we cannot determine validity clearly
    provenanceStatus = "c2pa_invalid";
  }

  // ── 3. Content / edit status ───────────────────────────────────────────────
  let contentEditStatus = "unknown";

  const isAI = detectAI(mfst);

  if (
    hasC2pa &&
    (provenanceStatus === "c2pa_fully_verified" ||
      provenanceStatus === "c2pa_signed_unverified_cert")
  ) {
    if (isAI) {
      contentEditStatus = "ai_generated";
    } else {
      const acts = getActions(active);
      const hasEditActions = acts.some((a) =>
        [
          "edited",
          "modified",
          "cropped",
          "resized",
          "colorCorrected",
          "retouched",
          "composite",
          "filtered",
          "textAdded",
          "bgRemoved",
          "faceRetouched",
          "styleTransfer",
        ].includes(a.action),
      );
      contentEditStatus = hasEditActions
        ? "disclosed_edits"
        : "original_or_camera_capture";
    }
  } else if (!hasC2pa) {
    const sw = detectEditingSoftware(ex);
    if (sw) {
      contentEditStatus = "suspected_undisclosed_editing";
    } else if (ex.Make || ex.make || ex.Model || ex.model) {
      contentEditStatus = "original_or_camera_capture";
    } else {
      contentEditStatus = "unknown";
    }
  }
  // For tampered/invalid C2PA we leave it as 'unknown' — we can't trust the manifest

  // ── 4. Forensic metadata signals ──────────────────────────────────────────
  const editingSoftware = detectEditingSoftware(ex);
  const hasCamera = !!(ex.Make || ex.make || ex.Model || ex.model);
  const hasTimestamp = !!(ex.DateTimeOriginal || ex.dateTimeOriginal);
  const hasGPS = ex.GPSLatitude != null || ex.latitude != null;
  const timestampConsistency = computeTimestampConsistency(ex);
  const certTrusted = hasC2pa && sigOK && !certUntrusted && !certRevoked;
  const aiGeneratorTags = detectAIGeneratorTags(ex);
  const xmpPresent = detectXMPPresence(ex);

  const authenticityScore = computeAuthenticityScore({
    hasC2pa,
    sigOK,
    certTrusted,
    certRevoked,
    contentMismatch,
    hasCamera,
    hasTimestamp,
    timestampConsistency,
    editingSoftware,
    hasGPS,
    isAI,
  });

  // ── 5. Final trust judgement ───────────────────────────────────────────────
  let finalTrustJudgement;

  switch (provenanceStatus) {
    case "c2pa_fully_verified": {
      const contradicts = exifContradictsC2PA(active, ex);
      if (contradicts) {
        finalTrustJudgement = "inconsistent_or_suspicious";
      } else if (contentEditStatus === "original_or_camera_capture") {
        finalTrustJudgement = "strong_provenance";
      } else if (
        contentEditStatus === "disclosed_edits" ||
        contentEditStatus === "ai_generated"
      ) {
        finalTrustJudgement = "verified_with_disclosed_edits";
      } else {
        // Verified but we couldn't determine content edit status
        finalTrustJudgement = "strong_provenance";
      }
      break;
    }

    case "c2pa_signed_unverified_cert":
      // Valid crypto, content intact — just not in the SDK's pre-approved trust store
      finalTrustJudgement = "provisionally_signed";
      break;

    case "c2pa_tampered":
      finalTrustJudgement = "tampered";
      break;

    case "c2pa_invalid":
      finalTrustJudgement = "invalid_provenance";
      break;

    case "no_c2pa":
    default:
      finalTrustJudgement = hasCamera
        ? "limited_evidence"
        : "insufficient_evidence";
      break;
  }

  // ── 6. Assemble result ─────────────────────────────────────────────────────
  const metadata = {
    hasC2pa,
    sigOK,
    certTrusted,
    certUntrusted,
    certRevoked,
    contentMismatch,
    isAI,
    // forensic signals
    timestampConsistency,
    editingSoftware,
    hasCamera,
    hasTimestamp,
    hasGPS,
    authenticityScore,
    aiGeneratorTags,
    xmpPresent,
    // raw data for downstream consumers
    actions: hasC2pa ? getActions(active) : [],
    assertions: hasC2pa ? getAssertions(active) : [],
    exif: ex,
  };

  return {
    provenanceStatus,
    contentEditStatus,
    finalTrustJudgement,
    metadata,
    // Keep metadataSupportStatus for backwards compatibility with scorer.js
    metadataSupportStatus: deriveMetadataSupportStatus(
      provenanceStatus,
      active,
      ex,
    ),
  };
}

// ─── Backwards-compat helper ──────────────────────────────────────────────────

/**
 * Derive metadataSupportStatus for backwards-compatible scorer usage.
 * @param {string} provenanceStatus
 * @param {object|null} active
 * @param {object} exif
 * @returns {string}
 */
function deriveMetadataSupportStatus(provenanceStatus, active, exif) {
  if (provenanceStatus === "c2pa_fully_verified") {
    return exifContradictsC2PA(active, exif)
      ? "metadata_inconsistent"
      : "metadata_supports_claim";
  }
  if (provenanceStatus === "c2pa_signed_unverified_cert") {
    return "metadata_supports_claim";
  }
  if (provenanceStatus === "no_c2pa") {
    const hasUseful = !!(
      exif?.Make ||
      exif?.make ||
      exif?.Model ||
      exif?.model ||
      exif?.DateTimeOriginal ||
      exif?.dateTimeOriginal ||
      exif?.GPSLatitude
    );
    return hasUseful ? "metadata_not_useful" : "metadata_missing_or_stripped";
  }
  return "metadata_not_useful";
}
