// ─────────────────────────────────────────────────────────────
// classifier.js — three-tier trust classification
//
// New framework (revised):
//   Tier 1 — Overall Trust Classification: verified | edited | aiGenerated
//   Tier 2 — Image Origin Indicator:     camera | processed | unknown
//   Tier 3 — Provenance Confidence:      strong | partial | none
//
// The old single-tier verdict system has been replaced. "tampered"
// and other negatively-framed labels are gone; "edited" is neutral
// and reflects that most post-processing is legitimate.
// "Verified" now requires stricter conditions (valid signature,
// trusted certificate, no significant post-sign edits, no AI).
// ─────────────────────────────────────────────────────────────
import { DST, ACTIONS, EDIT_SW } from './data.js';
import {
  getActiveManifest, getValidationStatus, getValidationResults,
  getActions, getAssertions, getDST,
} from './helpers.js';

/**
 * Classify an image into the revised three-tier trust framework.
 *
 * @param {object|null} mfst — parsed C2PA manifest store (or null)
 * @param {object}      exif — parsed EXIF metadata (or {})
 * @param {File}        file — the image File object
 * @returns {object} three-tier classification result
 */
export function classifyImage(mfst, exif, file) {
  const active = getActiveManifest(mfst);
  const hasC2pa = !!active;

  // ── C2PA validation signals ───────────────────────────────────
  const vr       = hasC2pa ? getValidationResults(mfst) : null;
  const success  = vr?.success ?? [];
  const failure  = vr?.failure ?? [];
  const vstatus  = hasC2pa ? getValidationStatus(mfst) : [];

  const sigOK           = success.some(v => v.code === 'claimSignature.validated');
  const certUntrusted   = vstatus.some(v => v.code === 'signingCredential.untrusted')
                       || failure.some(v => v.code === 'signingCredential.untrusted');
  const certRevoked     = failure.some(v => v.code === 'signingCredential.revoked');
  const contentMismatch = failure.some(v =>
    ['claimSignature.mismatch', 'assertion.hashedURI.mismatch', 'assertion.dataHash.mismatch'].includes(v.code)
  );

  // ── AI detection: scan EVERY manifest in the store ────────────
  const allManifestValues = Object.values(mfst?.manifests ?? {});
  const isAI = allManifestValues.some(m => {
    const acts = getActions(m);
    if (acts.some(a => {
      const key = a.digitalSourceType?.split('/').pop();
      return DST[key]?.ai || ACTIONS[a.action]?.risk === 'critical';
    })) return true;
    const dstAssertion = getAssertions(m).find(x => x.data?.digitalSourceType);
    const dstKey = dstAssertion?.data?.digitalSourceType?.split('/').pop();
    return DST[dstKey]?.ai ?? false;
  });

  // ── Modification level from C2PA actions ─────────────────────
  const activeActions    = hasC2pa ? getActions(active) : [];
  const hasHighRiskActs  = activeActions.some(a => ['high', 'critical'].includes(ACTIONS[a.action]?.risk));
  const hasModerateActs  = activeActions.some(a => ACTIONS[a.action]?.risk === 'moderate');

  // ── EXIF signals ──────────────────────────────────────────────
  const sw         = (exif?.Software ?? '').toLowerCase();
  const isEditSW   = EDIT_SW.some(s => sw.includes(s));
  const make       = exif?.Make ?? exif?.make ?? '';
  const model      = exif?.Model ?? exif?.model ?? '';
  const hasCameraEXIF = !!(make || model);

  // ══════════════════════════════════════════════════════════════
  // TIER 1 — Overall Trust Classification
  // ══════════════════════════════════════════════════════════════
  let t1Class, t1Label, colorClass;

  // AI-generated trumps everything else
  if (isAI) {
    t1Class  = 'aiGenerated';
    t1Label  = 'AI Generated';
    colorClass = 'cpurp';
  }
  // Verified: strict conditions — valid sig, trusted cert,
  //           no content hash failures, no significant post-sign edits
  else if (hasC2pa && sigOK && !certUntrusted && !certRevoked && !contentMismatch && !hasHighRiskActs) {
    t1Class  = 'verified';
    t1Label  = 'Verified';
    colorClass = 'cteal';
  }
  // Edited: evidence of modification (C2PA edits or EXIF editing sw)
  else if (hasC2pa && (contentMismatch || certRevoked || hasHighRiskActs || (hasModerateActs && !sigOK))) {
    t1Class  = 'edited';
    t1Label  = 'Edited';
    colorClass = 'camber';
  }
  else if (!hasC2pa && isEditSW) {
    t1Class  = 'edited';
    t1Label  = 'Edited';
    colorClass = 'camber';
  }
  // Unverified: some data exists but can't meet "verified" bar
  else if (hasC2pa) {
    t1Class  = 'unverified';
    t1Label  = 'Unverified';
    colorClass = 'cblue';
  }
  else if (hasCameraEXIF && !isEditSW) {
    t1Class  = 'unverified';
    t1Label  = 'Unverified';
    colorClass = 'cblue';
  }
  // No provenance at all
  else {
    t1Class  = 'no_provenance';
    t1Label  = 'No Provenance';
    colorClass = 'cgrey';
  }

  // ══════════════════════════════════════════════════════════════
  // TIER 2 — Image Origin Indicator
  // ══════════════════════════════════════════════════════════════
  let t2Indicator, t2Label;
  if (hasCameraEXIF && !isEditSW && !isAI) {
    t2Indicator = 'camera';
    t2Label     = 'Camera-originated';
  } else if (isAI) {
    t2Indicator = 'synthetic';
    t2Label     = 'Synthetic / AI-generated';
  } else if (isEditSW || hasHighRiskActs || hasModerateActs) {
    t2Indicator = 'processed';
    t2Label     = 'Processed / edited';
  } else {
    t2Indicator = 'unknown';
    t2Label     = 'Origin unknown';
  }

  // ══════════════════════════════════════════════════════════════
  // TIER 3 — Provenance Confidence
  // ══════════════════════════════════════════════════════════════
  let t3Conf, t3Label;
  if (hasC2pa && sigOK && !certUntrusted && !certRevoked) {
    t3Conf  = 'strong';
    t3Label = 'Strong provenance';
  } else if (hasC2pa || (hasCameraEXIF && exif?.DateTimeOriginal)) {
    t3Conf  = 'partial';
    t3Label = 'Partial provenance';
  } else {
    t3Conf  = 'none';
    t3Label = 'No provenance data';
  }

  // Backward-compat: keep tier/verdict for existing consumers
  const tier = hasC2pa ? 1 : (hasCameraEXIF || isEditSW ? 2 : 3);

  return {
    // ── New three-tier framework ──
    tier1: { classification: t1Class, label: t1Label },
    tier2: { indicator: t2Indicator, label: t2Label },
    tier3: { confidence: t3Conf,     label: t3Label },
    // ── Backward-compatible fields ──
    tier,
    verdict: t1Class,
    verdictLabel: t1Label,
    colorClass,
  };
}
