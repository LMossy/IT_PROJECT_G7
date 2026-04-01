// ─────────────────────────────────────────────────────────────
// classifier.js — three-tier image classification
//
// Returns a classification object:
//   { tier, verdict, verdictLabel, colorClass }
//
// Tier 1 — C2PA manifest present
// Tier 2 — No C2PA, but meaningful EXIF metadata
// Tier 3 — No provenance data at all
// ─────────────────────────────────────────────────────────────
import { DST, ACTIONS, EDIT_SW } from './data.js';
import {
  getActiveManifest, getValidationStatus, getValidationResults,
  getActions, getAssertions, getDST,
} from './helpers.js';

export function classifyImage(mfst, exif, file) {
  const active = getActiveManifest(mfst);

  // ── TIER 1: C2PA manifest present ──────────────────────────
  if (active) {
    const vr       = getValidationResults(mfst);
    const success  = vr?.success  ?? [];
    const failure  = vr?.failure  ?? [];
    const vstatus  = getValidationStatus(mfst);

    const sigOK       = success.some(v => v.code === 'claimSignature.validated');
    const sigBroken   = failure.some(v =>
      ['claimSignature.mismatch', 'assertion.hashedURI.mismatch', 'assertion.dataHash.mismatch']
        .includes(v.code)
    );
    const certUnt     = vstatus.some(v => v.code === 'signingCredential.untrusted')
                     || failure.some(v => v.code === 'signingCredential.untrusted');
    const certRevoked = failure.some(v => v.code === 'signingCredential.revoked');

    // AI detection — scan EVERY manifest in the store.
    // The AI declaration is often in a parent/ingredient manifest,
    // not the active one (e.g. Google Gemini images).
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

    if (sigBroken || certRevoked)
      return { tier: 1, verdict: 'c2pa_tampered',        verdictLabel: 'Tampered manifest',               colorClass: 'cred'   };
    if (isAI)
      return { tier: 1, verdict: 'c2pa_ai_declared',     verdictLabel: 'AI-generated (declared in C2PA)', colorClass: 'cpurp'  };
    if (sigOK && !certUnt)
      return { tier: 1, verdict: 'c2pa_verified',        verdictLabel: 'Cryptographically verified',      colorClass: 'cteal'  };
    if (sigOK && certUnt)
      return { tier: 1, verdict: 'c2pa_signed_untrusted',verdictLabel: 'Signed — cert not in trust list', colorClass: 'camber' };
    return   { tier: 1, verdict: 'c2pa_manifest',        verdictLabel: 'Manifest present (unverified)',   colorClass: 'cblue'  };
  }

  // ── TIER 2: No C2PA but meaningful EXIF ────────────────────
  const hasExif = exif && Object.keys(exif).length > 3;
  if (hasExif) {
    const make   = exif.Make  ?? exif.make;
    const model  = exif.Model ?? exif.model;
    const sw     = (exif.Software ?? '').toLowerCase();
    const isEdit = EDIT_SW.some(s => sw.includes(s));

    if (make && model && !isEdit)
      return { tier: 2, verdict: 'exif_camera',  verdictLabel: 'Camera photo (unverified)',     colorClass: 'cblue'  };
    if (isEdit)
      return { tier: 2, verdict: 'exif_edited',  verdictLabel: 'Edited photo (unverified)',     colorClass: 'camber' };
    if (make || model || exif.DateTimeOriginal)
      return { tier: 2, verdict: 'exif_partial', verdictLabel: 'Partial metadata (unverified)', colorClass: 'camber' };
  }

  // ── TIER 3: No provenance at all ───────────────────────────
  return { tier: 3, verdict: 'no_provenance', verdictLabel: 'No provenance data', colorClass: 'cgrey' };
}
