// ─────────────────────────────────────────────────────────────
// scorer.js — evidence analysis (Stage 1: score system overhaul)
//
// Returns: { evidence, signals }
//
// evidence — three structured rows shown in the emblem card:
//   [{ label, value, status }]
//   status: 'ok' | 'warn' | 'bad' | 'neutral' | 'info' | 'purple'
//
// signals — plain audit log shown in the accordion:
//   [{ text, status }]
//   No points, no invented weights.
// ─────────────────────────────────────────────────────────────
import { DST, ACTIONS, EDIT_SW } from './data.js';
import {
  getActiveManifest, getValidationStatus, getValidationResults,
  getActions, getAssertions, getDST, claimGen, getSigInfo, fmtDate,
} from './helpers.js';

export function computeScore(mfst, exif, cls) {
  const active  = getActiveManifest(mfst);
  const vr      = getValidationResults(mfst);
  const success = vr?.success ?? [];
  const failure = vr?.failure ?? [];
  const vstatus = getValidationStatus(mfst);

  const sigOK   = success.some(v => v.code === 'claimSignature.validated');
  const certUnt = vstatus.some(v => v.code === 'signingCredential.untrusted')
               || failure.some(v => v.code === 'signingCredential.untrusted');

  // ── Row 1: Provenance source ─────────────────────────────
  // What physical evidence was found in this image?
  const provenanceRow = (() => {
    const label = 'Provenance source';
    switch (cls.tier) {
      case 1: {
        if (cls.verdict === 'c2pa_tampered')
          return { label, value: 'C2PA manifest (integrity failed)', status: 'bad' };
        if (cls.verdict === 'c2pa_ai_declared')
          return { label, value: 'C2PA manifest — AI-generated image', status: 'purple' };
        return { label, value: 'C2PA manifest', status: 'ok' };
      }
      case 2: {
        const make  = exif?.Make  ?? exif?.make  ?? '';
        const model = exif?.Model ?? exif?.model ?? '';
        const device = [make, model].filter(Boolean).join(' ');
        if (cls.verdict === 'exif_edited')
          return { label, value: 'EXIF metadata — editing software detected', status: 'warn' };
        if (device)
          return { label, value: `EXIF metadata — ${device}`, status: 'info' };
        return { label, value: 'EXIF metadata — partial', status: 'warn' };
      }
      default:
        return { label, value: 'None detected', status: 'neutral' };
    }
  })();

  // ── Row 2: Signature / integrity ─────────────────────────
  // Can the provenance be trusted cryptographically?
  const signatureRow = (() => {
    const label = 'Signature integrity';
    if (cls.tier !== 1)
      return { label, value: 'Not applicable — no C2PA manifest', status: 'neutral' };
    switch (cls.verdict) {
      case 'c2pa_verified':
        return { label, value: 'Valid — certificate trusted', status: 'ok' };
      case 'c2pa_signed_untrusted':
        return { label, value: 'Valid — cert not in SDK trust store', status: 'warn' };
      case 'c2pa_ai_declared':
        return sigOK
          ? { label, value: certUnt ? 'Valid — cert not in SDK trust store' : 'Valid — certificate trusted', status: certUnt ? 'warn' : 'ok' }
          : { label, value: 'Unverifiable', status: 'warn' };
      case 'c2pa_tampered':
        return { label, value: 'FAILED — content altered after signing', status: 'bad' };
      default:
        return { label, value: 'Unverifiable', status: 'warn' };
    }
  })();

  // ── Row 3: Origin declaration ────────────────────────────
  // What does the provenance say about how the image was made?
  const originRow = (() => {
    const label = 'Origin declaration';

    if (cls.tier === 1 && active) {
      // Scan all manifests for DST
      const allMfsts = Object.values(mfst?.manifests ?? {});
      let dstLabel = null;
      for (const m of allMfsts) {
        const dst = getDST(m);
        if (dst) { dstLabel = DST[dst.split('/').pop()]?.label ?? dst.split('/').pop(); break; }
      }
      if (cls.verdict === 'c2pa_ai_declared')
        return { label, value: dstLabel ? `AI-generated — ${dstLabel}` : 'AI-generated', status: 'purple' };
      if (dstLabel)
        return { label, value: dstLabel, status: 'ok' };
      // Check claim generator as fallback
      const cg = claimGen(active);
      if (cg) return { label, value: `Declared by: ${cg}`, status: 'ok' };
      return { label, value: 'Not declared in manifest', status: 'neutral' };
    }

    if (cls.tier === 2) {
      const make   = exif?.Make  ?? exif?.make  ?? null;
      const model  = exif?.Model ?? exif?.model ?? null;
      const device = [make, model].filter(Boolean).join(' ');
      const sw     = exif?.Software ?? null;
      const isEdit = sw && EDIT_SW.some(s => sw.toLowerCase().includes(s));
      if (device && isEdit) return { label, value: `Camera capture — edited by ${sw}`, status: 'warn' };
      if (device)           return { label, value: `Camera capture — ${device}`, status: 'info' };
      if (exif?.DateTimeOriginal) return { label, value: 'Timestamp present, no device ID', status: 'warn' };
      return { label, value: 'Not declared', status: 'neutral' };
    }

    return { label, value: 'Unknown', status: 'neutral' };
  })();

  const evidence = [provenanceRow, signatureRow, originRow];

  // ── Audit log ────────────────────────────────────────────
  // Plain descriptions of what was found — no invented points.
  const signals = [];
  const note = (text, status = 'neutral') => signals.push({ text, status });

  if (cls.tier === 1 && active) {
    const si   = getSigInfo(active);
    const cg   = claimGen(active);
    const acts = getActions(active);
    const allM = Object.keys(mfst?.manifests ?? {});

    note('C2PA manifest found and parsed', 'ok');

    if (sigOK && !certUnt) note('Signature cryptographically validated — cert trusted', 'ok');
    else if (sigOK)        note('Signature mathematically valid — cert not in SDK trust store', 'warn');
    else if (failure.some(v => ['claimSignature.mismatch','assertion.hashedURI.mismatch','assertion.dataHash.mismatch'].includes(v.code)))
                           note('Signature validation failed — content altered after signing', 'bad');
    else                   note('Signature could not be verified', 'warn');

    if (si.issuer) note(`Signed by: ${si.issuer}${si.time ? ' on ' + fmtDate(si.time) : ''}`, 'ok');
    if (cg)        note(`Claim generator: ${cg}`, 'ok');
    if (allM.length > 1) note(`Provenance chain: ${allM.length} manifest signing events`, 'ok');

    const aiActs  = acts.filter(a => ACTIONS[a.action]?.risk === 'critical');
    const highActs = acts.filter(a => ACTIONS[a.action]?.risk === 'high');
    if (aiActs.length)
      aiActs.forEach(a => note(`AI action recorded: ${ACTIONS[a.action]?.label ?? a.action}${a.description ? ' — ' + a.description : ''}`, 'warn'));
    else if (highActs.length)
      highActs.forEach(a => note(`High-risk edit: ${ACTIONS[a.action]?.label ?? a.action}`, 'warn'));
    else if (acts.length)
      note(`${acts.length} action${acts.length > 1 ? 's' : ''} in edit history — no destructive operations`, 'ok');

    // Ingredients
    const ings = active.ingredients ?? [];
    if (ings.length) note(`${ings.length} ingredient${ings.length > 1 ? 's' : ''} referenced in provenance chain`, 'ok');

  } else if (cls.tier === 2) {
    const make   = exif?.Make  ?? exif?.make  ?? null;
    const model  = exif?.Model ?? exif?.model ?? null;
    const sw     = exif?.Software ?? null;
    const dOrig  = exif?.DateTimeOriginal;
    const gpsLat = exif?.GPSLatitude;
    const isEdit = sw && EDIT_SW.some(s => sw.toLowerCase().includes(s));

    note('No C2PA manifest — evaluating EXIF metadata only', 'neutral');
    if (make && model) note(`Camera identified: ${make} ${model}`, 'info');
    else if (make || model) note(`Partial camera identification: ${make ?? model}`, 'warn');

    if (dOrig) {
      const d = dOrig instanceof Date ? dOrig.toLocaleString() : String(dOrig);
      note(`Original capture timestamp: ${d}`, 'info');
    }
    if (exif?.DateTimeOriginal && exif?.DateTime &&
        String(exif.DateTimeOriginal) !== String(exif.DateTime))
      note('Timestamp inconsistency — captured and modified times differ', 'warn');

    if (gpsLat != null) note('GPS location data embedded', 'info');
    if (exif?.FocalLength != null) note('Lens and exposure data present', 'info');
    if (isEdit) note(`Editing software detected: ${sw}`, 'warn');
    note('EXIF metadata is self-reported — not cryptographically signed or tamper-evident', 'warn');

  } else {
    note('No C2PA manifest found', 'neutral');
    note('No significant EXIF metadata found', 'neutral');
    note('Origin, creation time, and editing history cannot be determined', 'neutral');
  }

  return { evidence, signals };
}
