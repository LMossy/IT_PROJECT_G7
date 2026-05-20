// ─────────────────────────────────────────────────────────────
// scorer.js — Trust evidence scoring (revised framework)
//
// Returns: { evidence, signals }
//
// evidence — structured rows for the emblem card:
//   [{ label, value, status }]
//   status: 'ok' | 'warn' | 'bad' | 'neutral' | 'info' | 'purple'
//
// signals — plain audit log for the accordion:
//   [{ text, status }]
//
// Revised to support the three-tier trust indicator:
//   Tier 1: Verified / Edited / AI Generated / No Provenance
//   Tier 2: Camera-originated / Processed / Unknown
//   Tier 3: Strong / Partial / No provenance
// ─────────────────────────────────────────────────────────────
import { DST, ACTIONS, EDIT_SW } from './data.js';
import {
  getActiveManifest, getValidationStatus, getValidationResults,
  getActions, getAssertions, getDST, claimGen, getSigInfo, fmtDate,
} from './helpers.js';

export function computeScore(mfst, exif, cls) {
  const active  = getActiveManifest(mfst);
  const hasC2pa = !!active;
  const vr      = hasC2pa ? getValidationResults(mfst) : null;
  const success = vr?.success ?? [];
  const failure = vr?.failure ?? [];
  const vstatus = hasC2pa ? getValidationStatus(mfst) : [];

  const sigOK           = success.some(v => v.code === 'claimSignature.validated');
  const certUntrusted   = vstatus.some(v => v.code === 'signingCredential.untrusted')
                       || failure.some(v => v.code === 'signingCredential.untrusted');
  const certRevoked     = failure.some(v => v.code === 'signingCredential.revoked');
  const contentMismatch = failure.some(v =>
    ['claimSignature.mismatch', 'assertion.hashedURI.mismatch', 'assertion.dataHash.mismatch'].includes(v.code)
  );

  // ── Row 1: Provenance source ─────────────────────────────
  const provenanceRow = (() => {
    const label = 'Provenance source';

    if (hasC2pa && cls.tier1.classification === 'aiGenerated') {
      const dstKey = getDST(active)?.split('/').pop();
      const dstLabel = DST[dstKey]?.label || dstKey || 'AI system';
      return { label, value: `AI-generated — ${dstLabel}`, status: 'purple' };
    }
    if (hasC2pa && !contentMismatch && !certRevoked) {
      if (sigOK && !certUntrusted) {
        return { label, value: 'C2PA manifest — verified signature, trusted certificate', status: 'ok' };
      }
      if (sigOK && certUntrusted) {
        return { label, value: 'C2PA manifest — valid signature, certificate outside trust store', status: 'warn' };
      }
      return { label, value: 'C2PA manifest — signature could not be verified', status: 'warn' };
    }
    if (hasC2pa && (contentMismatch || certRevoked)) {
      return { label, value: 'C2PA manifest — content modified after signing', status: 'warn' };
    }

    // Tier 2 — no C2PA
    const make   = exif?.Make ?? exif?.make ?? '';
    const model  = exif?.Model ?? exif?.model ?? '';
    const device = [make, model].filter(Boolean).join(' ');
    const sw     = (exif?.Software ?? '').toLowerCase();
    const isEdit = EDIT_SW.some(s => sw.includes(s));

    if (device && isEdit)
      return { label, value: `EXIF metadata — ${device} (edited by ${sw})`, status: 'warn' };
    if (device)
      return { label, value: `EXIF metadata — ${device}`, status: 'info' };
    if (isEdit)
      return { label, value: 'EXIF metadata — editing software detected, no device info', status: 'warn' };
    return { label, value: 'No provenance source detected', status: 'neutral' };
  })();

  // ── Row 2: Signature / integrity ─────────────────────────
  const signatureRow = (() => {
    const label = 'Signature integrity';

    if (!hasC2pa) {
      const sw = (exif?.Software ?? '').toLowerCase();
      const isEdit = EDIT_SW.some(s => sw.includes(s));
      if (isEdit) return { label, value: 'No cryptographic signature — EXIF shows editing software', status: 'warn' };
      return { label, value: 'No C2PA manifest — integrity cannot be cryptographically verified', status: 'neutral' };
    }
    if (sigOK && !certUntrusted && !certRevoked && !contentMismatch) {
      return { label, value: 'Valid — cryptographically signed and verified', status: 'ok' };
    }
    if (sigOK && !certUntrusted && !certRevoked && contentMismatch) {
      return { label, value: 'Signature valid but content hash mismatch — modified after signing', status: 'warn' };
    }
    if (certRevoked) {
      return { label, value: 'Signature valid but certificate has been revoked', status: 'bad' };
    }
    if (sigOK && certUntrusted) {
      return { label, value: 'Signature valid — certificate not in SDK trust store (may be pre-production)', status: 'warn' };
    }
    if (!sigOK && contentMismatch) {
      return { label, value: 'Invalid signature with content mismatch', status: 'bad' };
    }
    return { label, value: 'Signature could not be verified', status: 'warn' };
  })();

  // ── Row 3: Modification assessment ──────────────────────
  const originRow = (() => {
    const label = 'Modification assessment';

    if (hasC2pa && cls.tier1.classification === 'aiGenerated') {
      return { label, value: 'Synthetic image — AI generation declared in provenance', status: 'purple' };
    }

    const acts = hasC2pa ? getActions(active) : [];
    const highRisk = acts.filter(a => ACTIONS[a.action]?.risk === 'high' || ACTIONS[a.action]?.risk === 'critical');
    const modRisk  = acts.filter(a => ACTIONS[a.action]?.risk === 'moderate');
    const lowRisk  = acts.filter(a => ['low', 'none'].includes(ACTIONS[a.action]?.risk));

    if (highRisk.length > 0) {
      const names = highRisk.map(a => ACTIONS[a.action]?.label ?? a.action).join(', ');
      return { label, value: `Significant edits detected — ${names}`, status: 'warn' };
    }
    if (modRisk.length > 0 && !sigOK) {
      const names = modRisk.map(a => ACTIONS[a.action]?.label ?? a.action).join(', ');
      return { label, value: `Moderate edits — ${names}`, status: 'warn' };
    }
    if (modRisk.length > 0) {
      return { label, value: `Minor modifications — ${acts.length} action(s) logged`, status: 'info' };
    }
    if (lowRisk.length > 0 && sigOK) {
      return { label, value: 'Minimal post-sign processing — only low-risk actions', status: 'ok' };
    }

    // EXIF-based assessment (no C2PA)
    if (!hasC2pa) {
      const sw = (exif?.Software ?? '').toLowerCase();
      const isEdit = EDIT_SW.some(s => sw.includes(s));
      if (isEdit) return { label, value: 'Edited with external software', status: 'warn' };
      if (exif?.DateTimeOriginal) return { label, value: 'No editing detected from metadata', status: 'info' };
    }

    return { label, value: 'No modification data available', status: 'neutral' };
  })();

  const evidence = [provenanceRow, signatureRow, originRow];

  // ── Audit log (signals) ─────────────────────────────────
  const signals = [];
  const note = (text, status = 'neutral') => signals.push({ text, status });

  // C2PA section
  if (hasC2pa) {
    const si   = getSigInfo(active);
    const cg   = claimGen(active);
    const acts = getActions(active);
    const allM = Object.keys(mfst?.manifests ?? {});

    note('C2PA manifest found and parsed', 'ok');

    if (sigOK && !certUntrusted && !certRevoked) {
      note('Signature cryptographically validated — certificate trusted', 'ok');
    } else if (sigOK && certUntrusted) {
      note('Signature mathematically valid — certificate not in SDK trust store', 'warn');
    } else if (contentMismatch) {
      note('Content mismatch detected — image modified after signing', 'warn');
    } else if (certRevoked) {
      note('Certificate has been revoked', 'bad');
    } else {
      note('Signature could not be verified', 'warn');
    }

    if (si.issuer) note(`Signed by: ${si.issuer}${si.time ? ' on ' + fmtDate(si.time) : ''}`, 'ok');
    if (cg) note(`Created/processed by: ${cg}`, 'ok');
    if (allM.length > 1) note(`Provenance chain: ${allM.length} signing events`, 'ok');

    // Ingredient manifests
    const ings = active?.ingredients ?? [];
    if (ings.length) note(`${ings.length} ingredient(s) referenced in provenance chain`, 'ok');

    if (cls.tier1.classification === 'aiGenerated') {
      const dstKey = getDST(active)?.split('/').pop();
      note('AI origin declared in manifest', 'warn');
      if (DST[dstKey]) note(`Digital source type: ${DST[dstKey].label}`, 'info');
    }

    // Action summary
    if (acts.length > 0) {
      const highRisk = acts.filter(a => ACTIONS[a.action]?.risk === 'high' || ACTIONS[a.action]?.risk === 'critical');
      const modRisk  = acts.filter(a => ACTIONS[a.action]?.risk === 'moderate');
      if (highRisk.length) {
        highRisk.forEach(a => note(`High-risk edit: ${ACTIONS[a.action]?.label ?? a.action}${a.description ? ' — ' + a.description : ''}`, 'warn'));
      } else if (modRisk.length) {
        modRisk.forEach(a => note(`Moderate edit: ${ACTIONS[a.action]?.label ?? a.action}${a.description ? ' — ' + a.description : ''}`, 'info'));
      } else {
        note(`${acts.length} action(s) in edit history — no destructive operations`, 'ok');
      }
    }
  }

  // EXIF section
  if (!hasC2pa) {
    const sw     = (exif?.Software ?? '').toLowerCase();
    const isEdit = EDIT_SW.some(s => sw.includes(s));

    note('No C2PA manifest found — evaluating EXIF metadata only', 'neutral');

    if (make && model) {
      note(`Camera identified: ${make} ${model}`, 'info');
    } else if (make || model) {
      note(`Partial camera identification: ${make || model}`, 'warn');
    }

    if (exif?.DateTimeOriginal) {
      const d = exif.DateTimeOriginal instanceof Date ? exif.DateTimeOriginal.toLocaleString() : String(exif.DateTimeOriginal);
      note(`Capture timestamp: ${d}`, 'info');
    }
    if (exif?.DateTimeOriginal && exif?.DateTime &&
        String(exif.DateTimeOriginal) !== String(exif.DateTime)) {
      note('Timestamp inconsistency — capture and modification times differ', 'warn');
    }
    if (exif?.GPSLatitude != null) note('GPS location data embedded', 'info');
    if (exif?.FocalLength != null) note('Lens and exposure data present', 'info');
    if (isEdit) note(`Editing software detected: ${exif.Software ?? sw}`, 'warn');
    note('EXIF metadata is self-reported and not cryptographically signed — treat as informational only', 'warn');
  } else if (exif && Object.keys(exif).length > 0 && !sigOK) {
    // Cross-reference: C2PA present but not verified, check EXIF for extra signals
    const sw = (exif?.Software ?? '').toLowerCase();
    if (EDIT_SW.some(s => sw.includes(s))) {
      note('EXIF also indicates editing software was used', 'warn');
    }
    if (exif?.DateTimeOriginal) {
      const d = exif.DateTimeOriginal instanceof Date ? exif.DateTimeOriginal.toLocaleString() : String(exif.DateTimeOriginal);
      note(`EXIF capture timestamp: ${d}`, 'info');
    }
  }

  // No-provenance case
  if (!hasC2pa && (!exif || Object.keys(exif).length <= 3)) {
    note('No C2PA manifest found', 'neutral');
    note('No significant EXIF metadata found', 'neutral');
    note('Origin, creation time, and editing history cannot be determined', 'neutral');
    note('This does not imply inauthenticity — many legitimate images carry no provenance data', 'neutral');
  }

  return { evidence, signals };
}