// ─────────────────────────────────────────────────────────────
// renderer.js — report building and DOM injection
//
// Three exported functions:
//   buildReasonBullets()   — 4 plain-English bullets
//   buildDetailSections()  — full accordion HTML
//   renderReport()         — injects everything into #report
// ─────────────────────────────────────────────────────────────
import { DST, ACTIONS, VSTATUS, EDIT_SW } from './data.js';
import { esc, dr, safeJSON } from './utils.js';
import {
  getActiveManifest, getValidationStatus, getValidationResults,
  getAssertions, getActions, getDST, claimGen, getSigInfo, fmtDate,
} from './helpers.js';
import { makeEmblem } from './emblem.js';

// ─── Verdict display strings ──────────────────────────────────
const VDICT = {
  c2pa_verified:         'Cryptographically verified',
  c2pa_signed_untrusted: 'Signed — cert not yet in trust list',
  c2pa_ai_declared:      'AI-generated (declared in C2PA)',
  c2pa_tampered:         'Tampered manifest',
  c2pa_manifest:         'Manifest present (unverified)',
  exif_camera:           'Camera photo (unverified)',
  exif_edited:           'Edited photo (unverified)',
  exif_partial:          'Partial metadata (unverified)',
  no_provenance:         'No provenance data',
};

const SUMMARIES = {
  c2pa_verified:
    'This image carries a valid C2PA manifest with a cryptographically verified signature from a trusted certificate. The chain of custody is intact and the claim generator is identified.',
  c2pa_signed_untrusted:
    'A C2PA manifest is present and the signature is mathematically valid, but the signing certificate is not yet in the CAI trust list. The content has not been altered since signing.',
  c2pa_ai_declared:
    'The C2PA manifest explicitly declares this image was produced by a generative AI system. The digital source type or action history identifies AI-generated content. This is a provenance disclosure, not a negative finding.',
  c2pa_tampered:
    'A C2PA manifest is present but its cryptographic signature fails validation. The image content or manifest data has been modified after the original signing event. Do not trust provenance claims from this image.',
  c2pa_manifest:
    'A C2PA manifest is present but could not be fully verified. Some provenance data is readable.',
  exif_camera:
    'No C2PA manifest is present. EXIF metadata identifies a camera device and capture settings, providing contextual evidence of origin. This data is self-reported and not cryptographically signed — treat it as informational, not proof.',
  exif_edited:
    'No C2PA manifest is present. EXIF metadata indicates the image was processed by editing software after capture.',
  exif_partial:
    'No C2PA manifest is present. Partial EXIF metadata is present, providing limited contextual information about origin.',
  no_provenance:
    'No C2PA manifest and no significant EXIF metadata were found. The origin, authorship, and editing history of this image are entirely unknown. This is normal for screenshots, web exports, and many AI-generated images — it does not imply manipulation.',
};

// ─── Reason bullets ───────────────────────────────────────────
/**
 * Build up to 4 plain-English reason bullets.
 * @returns {Array<{text:string, type:string}>}  type = ok|info|warn|bad|neutral
 */
export function buildReasonBullets(mfst, exif, cls, file) {
  const bullets = [];
  const add = (text, type = 'info') => bullets.push({ text, type });

  if (cls.tier === 1) {
    const active = getActiveManifest(mfst);
    const vr = getValidationResults(mfst);
    const success = vr?.success ?? [];
    const failure = vr?.failure ?? [];
    const sigOK = success.some(v => v.code === 'claimSignature.validated');
    const certUnt = [...getValidationStatus(mfst), ...failure]
      .some(v => v.code === 'signingCredential.untrusted');
    
    switch (cls.verdict) {
      case 'c2pa_tampered':
        add('A C2PA manifest is embedded but its cryptographic signature fails — the image or manifest was altered after signing.', 'bad');
        const failCodes = failure.map(f => VSTATUS[f.code]?.label ?? f.code);
        if (failCodes.length) add('Specific failures: ' + failCodes.join(', ') + '.', 'bad');
        add('Do not rely on any provenance data from this image.', 'bad');
        break;
      case 'c2pa_ai_declared': {
        const si = getSigInfo(active);
        const issuerStr = si.issuer ? 'by ' + si.issuer : '';
        add('This image was declared AI-generated ' + issuerStr + (si.time ? ' on ' + fmtDate(si.time) : '') + '.', 'info');
        const dstKey = getDST(active)?.split('/').pop();
        if (DST[dstKey]) add('Digital source type: ' + DST[dstKey].label + '.', 'info');
        const aiActs = getActions(active).filter(a => ACTIONS[a.action]?.risk === 'critical');
        if (aiActs.length)
          add('AI actions recorded: ' + aiActs.map(a =>
            (ACTIONS[a.action]?.label ?? a.action) + (a.description ? ' — ' + a.description : '')
          ).join('; ') + '.', 'info');
        if (sigOK) add('The manifest signature is cryptographically valid — this declaration is authentic.', 'ok');
        if (certUnt) add('Certificate not found in the SDK\'s bundled trust store. The signature itself is mathematically valid.', 'neutral');
        break;
      }
      case 'c2pa_verified': {
        const si = getSigInfo(active);
        add('Signed by ' + (si.issuer ?? 'an identified issuer') + (si.time ? ' on ' + fmtDate(si.time) : '') + '. Signature is cryptographically valid.', 'ok');
        const cg = claimGen(active);
        if (cg) add('Created or processed by: ' + cg + '.', 'ok');
        const dstKey = getDST(active)?.split('/').pop();
        if (DST[dstKey]) add('Declared source type: ' + DST[dstKey].label + '.', 'ok');
        const allM = Object.keys(mfst?.manifests ?? {});
        if (allM.length > 1) add('Provenance chain contains ' + allM.length + ' signing events.', 'ok');
        break;
      }
      case 'c2pa_signed_untrusted': {
        const si = getSigInfo(active);
        add('Signed by ' + (si.issuer ?? 'an identified issuer') + (si.time ? ' on ' + fmtDate(si.time) : '') + '. Signature is mathematically valid.', 'ok');
        add('Certificate not in this SDK\'s bundled trust store. This is expected — the SDK uses an older trust list that predates many production signers (e.g. Google, Adobe).', 'neutral');
        const dstKey = getDST(active)?.split('/').pop();
        if (DST[dstKey]) add('Declared source type: ' + DST[dstKey].label + '.', 'info');
        const cg = claimGen(active);
        if (cg) add('Processed by: ' + cg + '.', 'info');
        break;
      }
      default: {
        const si = getSigInfo(active);
        add('A C2PA manifest is present but the signature could not be fully verified.', 'warn');
        if (si.issuer) add('Issuer field reads: ' + si.issuer + '.', 'info');
      }
    }
  } else if (cls.tier === 2) {
    const make = exif?.Make ?? exif?.make;
    const model = exif?.Model ?? exif?.model;
    const sw = exif?.Software;
    const isEdit = sw && EDIT_SW.some(s => sw.toLowerCase().includes(s));
    
    if (make && model) add('Camera identified as ' + make + ' ' + model + '.', 'info');
    if (exif?.DateTimeOriginal) {
      const d = exif.DateTimeOriginal instanceof Date ? exif.DateTimeOriginal.toLocaleString() : String(exif.DateTimeOriginal);
      add('Original capture timestamp: ' + d + '.', 'info');
    }
    if (isEdit) add('Editing software detected: ' + sw + '. The image may have been processed after capture.', 'warn');
    if (exif?.GPSLatitude != null) add('GPS coordinates are embedded — location data present.', 'info');
    add('EXIF metadata is self-reported and not cryptographically signed. These signals are informational only.', 'neutral');
  } else {
    const isPNG = file?.type === 'image/png';
    const isSmall = file?.size < 800_000;
    if (isPNG && isSmall) {
      add('This appears to be a screenshot or exported web image — PNG with no metadata is typical.', 'neutral');
    } else {
      add('No C2PA manifest was found in this image.', 'neutral');
    }
    add('No EXIF camera metadata is present. Origin, capture device, and editing history are unknown.', 'neutral');
    add('This does not mean the image is inauthentic — many legitimate images carry no provenance data.', 'neutral');
  }

  return bullets.slice(0, 4);
}

// ─── Detail sections (accordion body) ────────────────────────
/** Build the full technical HTML shown inside the accordion. */
export function buildDetailSections(file, mfst, exif, cls, sr) {
  let html = '';
  
  // ── Raw manifest JSON ─────────────────────────────────────────
  if (mfst) {
    let pretty = '';
    try { pretty = JSON.stringify(mfst, (_, v) => v instanceof Uint8Array ? '[binary]' : v, 2); } catch {}
    html += `<div class="blk"><div class="bh">Raw manifest (JSON)</div><div class="raw">${esc(pretty)}</div></div>`;
  }

  // ── EXIF metadata grid ────────────────────────────────────────
  const hasExif = exif && Object.keys(exif).length > 0;
  if (hasExif) {
    const e = exif;
    const make = e.Make ?? e.make ?? null;
    const model = e.Model ?? e.model ?? null;
    const sw = e.Software ?? null;
    const dOrig = e.DateTimeOriginal instanceof Date ? e.DateTimeOriginal.toLocaleString() : (e.DateTimeOriginal ?? null);
    const dMod = e.ModifyDate instanceof Date ? e.ModifyDate.toLocaleString() : (e.ModifyDate ?? e.DateTime ?? null);
    const iso = e.ISO ?? e.ISOSpeedRatings ?? null;
    const fn = e.FNumber != null ? `f/${+e.FNumber.toFixed(1)}` : null;
    const focal = e.FocalLength != null ? `${+e.FocalLength.toFixed(1)} mm` : null;
    const fl35 = e.FocalLengthIn35mmFormat != null ? `${e.FocalLengthIn35mmFormat} mm` : null;
    const exp2 = e.ExposureTime != null ? `${+e.ExposureTime.toFixed(6).replace(/\.?0+$/, '')} s` : null;
    const flash = e.Flash != null ? String(e.Flash) : null;
    const wb = e.WhiteBalance != null ? String(e.WhiteBalance) : null;
    const gpsLat = e.GPSLatitude != null ? `${+e.GPSLatitude.toFixed(6)}° ${e.GPSLatitudeRef ?? ''}`.trim() : null;
    const gpsLon = e.GPSLongitude != null ? `${+e.GPSLongitude.toFixed(6)}° ${e.GPSLongitudeRef ?? ''}`.trim() : null;
    const alt = e.GPSAltitude != null ? `${+e.GPSAltitude.toFixed(1)} m` : null;
    const cs = e.ColorSpace != null ? (e.ColorSpace === 1 ? 'sRGB' : e.ColorSpace === 65535 ? 'Uncalibrated' : String(e.ColorSpace)) : null;
    const dims = (e.PixelXDimension && e.PixelYDimension) ? `${e.PixelXDimension} × ${e.PixelYDimension} px` : null;
    const xres = e.XResolution != null ? `${Math.round(e.XResolution)} dpi` : null;
    const lens = e.LensModel ?? null;
    const lmake = e.LensMake ?? null;
    const serialB = e.BodySerialNumber ?? e.CameraSerialNumber ?? null;
    const editSW = sw && EDIT_SW.some(s => sw.toLowerCase().includes(s));
    const tsOK = dOrig && dMod;

    html += `
      <div class="mg">
        <div class="blk"><div class="bh">Camera &amp; device (EXIF — unverified)</div>
          ${dr('Make', make, make ? 'ok' : '')}
          ${dr('Model', model, model ? 'ok' : '')}
          ${dr('Software', sw, editSW ? 'wn' : '')}
          ${dr('Lens make', lmake)}
          ${dr('Lens model', lens)}
          ${dr('Body serial', serialB)}
        </div>
        <div class="blk"><div class="bh">Capture settings (EXIF — unverified)</div>
          ${dr('ISO', iso)}
          ${dr('Aperture', fn)}
          ${dr('Exposure', exp2)}
          ${dr('Focal length', focal)}
          ${dr('Focal (35mm)', fl35)}
          ${dr('Flash', flash)}
          ${dr('White balance', wb)}
        </div>
        <div class="blk"><div class="bh">Timestamps (EXIF — unverified)</div>
          ${dr('Date captured', dOrig, dOrig ? 'ok' : 'wn')}
          ${dr('Date modified', dMod)}
          ${dr('Timestamps match', tsOK ? (String(dOrig) === String(dMod) ? 'Yes' : 'No — mismatch') : '—',
            tsOK ? (String(dOrig) === String(dMod) ? 'ok' : 'wn') : '')}
        </div>
        <div class="blk"><div class="bh">Location &amp; image (EXIF — unverified)</div>
          ${dr('GPS latitude', gpsLat, gpsLat ? 'if' : '')}
          ${dr('GPS longitude', gpsLon, gpsLon ? 'if' : '')}
          ${dr('GPS altitude', alt)}
          ${dr('Colour space', cs, cs === 'Uncalibrated' ? 'wn' : cs ? 'ok' : '')}
          ${dr('Dimensions', dims)}
          ${dr('Resolution', xres)}
        </div>
      </div>`;
  } else {
    html += `<div class="blk"><div class="bh">Image metadata (EXIF)</div>
      <div class="np">No EXIF metadata found. This is expected for screenshots, AI-generated images, and web-optimised exports.</div></div>`;
  }
  return html;
}

// ─── Main render function ─────────────────────────────────────
/** Inject the full report into #report and wire up buttons. */
export function renderReport(file, dataURL, mfst, exif, cls, sr, onReset) {
  const { evidence, signals } = sr;
  const tierBadge = cls.tier === 1 ? 'Tier 1 — C2PA Provenance'
    : cls.tier === 2 ? 'Tier 2 — EXIF Evidence'
    : 'Tier 3 — No Provenance Data';

  // Evidence summary rows
  const statusIcon = {
    ok: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#0a7c59" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8l4 4 6-7"/></svg>',
    warn: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#b45309" stroke-width="2" stroke-linecap="round"><path d="M8 3v5M8 11v1"/><path d="M2 13L8 3l6 10H2z"/></svg>',
    bad: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#c0392b" stroke-width="2" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
    neutral: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round"><path d="M4 8h8"/></svg>',
    info: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#1a5fa8" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M8 7v4M8 5v.5"/></svg>',
    purple: '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="#6d3fb5" stroke-width="2" stroke-linecap="round"><path d="M3 8l4 4 6-7"/></svg>',
  };
  const statusTextClass = { ok:'cteal', warn:'camber', bad:'cred', neutral:'cgrey', info:'cblue', purple:'cpurp' };

  const evidenceRows = (evidence ?? []).map(row => `
    <div class="ev-row">
      <span class="ev-icon">${statusIcon[row.status] ?? statusIcon.neutral}</span>
      <span class="ev-label">${esc(row.label)}</span>
      <span class="ev-value ${statusTextClass[row.status] ?? 'cgrey'}">${esc(row.value)}</span>
    </div>`
  ).join('');

  // Reason bullets
  const bullets = buildReasonBullets(mfst, exif, cls, file);
  const bulletTypeClass = { ok: 'r-ok', info: 'r-info', warn: 'r-warn', bad: 'r-bad', neutral: 'r-neutral' };
  const bulletItems = bullets.map(b =>
    `<li class="reason-item"><span class="r-dot ${bulletTypeClass[b.type] ?? 'r-neutral'}"></span><span>${esc(b.text)}</span></li>`
  ).join('');

  const detailHTML = buildDetailSections(file, mfst, exif, cls, sr);

  const reportEl = document.getElementById('report');
  reportEl.innerHTML = `
    <div class="rpt-image-wrap">
      <img class="rpt-image" src="${esc(dataURL)}" alt="${esc(file.name)}">
    </div>
    <div class="emblem-card">
      <div class="embl-icon">${makeEmblem(cls)}</div>
      <div class="embl-body">
        <div class="tier-badge">${esc(tierBadge)}</div>
        <div class="verdict-name ${cls.colorClass}">${esc(VDICT[cls.verdict] ?? cls.verdict)}</div>
        <div class="verdict-file">${esc(file.name)} &nbsp;·&nbsp; ${(file.size / 1024).toFixed(1)} KB &nbsp;·&nbsp; ${esc(file.type || 'unknown')}</div>
      </div>
    </div>
    <div class="reasons">
      <div class="reasons-h">Why this verdict</div>
      <ul class="reason-list">${bulletItems}</ul>
    </div>
    <button class="acc-toggle" id="accBtn">
      <span class="acc-label"><span class="acc-icon"></span>View full analysis &amp; raw manifest</span>
      <span class="chevron">▼</span>
    </button>
    <div class="acc-body" id="accBody">${detailHTML}</div>
    <div class="brow">
      <button class="btn" id="rstBtn">↺ Analyse another image</button>
    </div>`;

  reportEl.classList.add('on');

  document.getElementById('accBtn').addEventListener('click', function () {
    this.classList.toggle('open');
    document.getElementById('accBody').classList.toggle('open');
  });

  document.getElementById('rstBtn').addEventListener('click', onReset);
  reportEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
