// ─────────────────────────────────────────────────────────────
// app.js — entry point
//
// Simplified Flow:
//   1. Load C2PA SDK
//   2. Wait for image upload
//   3. Analyze (C2PA + EXIF)
//   4. Render Trust Report & Emblem
// ─────────────────────────────────────────────────────────────
import { createC2pa } from 'https://esm.sh/@contentauth/c2pa-web@0.6.1/inline';
import * as Exifr     from 'https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/full.esm.js';

import { esc, delay }   from './utils.js';
import { analyseFile }  from './analyser.js';
import { renderReport } from './renderer.js';

// ─── DOM refs ─────────────────────────────────────────────────
const $sdkDot = document.getElementById('sdkDot');
const $sdkTxt = document.getElementById('sdkTxt');
const $notice = document.getElementById('notice');

const $dz    = document.getElementById('dz');
const $fi    = document.getElementById('fi');
const $dze   = document.getElementById('dze');
const $prev  = document.getElementById('prev');
const $pim   = document.getElementById('prevImg');
const $pnm   = document.getElementById('prevName');
const $pmeta = document.getElementById('prevMeta');
const $ch    = document.getElementById('chBtn');
const $go    = document.getElementById('goBtn');
const $scan  = document.getElementById('scan');
const $slbl  = document.getElementById('scanLbl');
const $pf    = document.getElementById('progFill');
const $sl    = document.getElementById('stepList');
const $rep   = document.getElementById('report');

// ─── SDK bootstrap ────────────────────────────────────────────
let sdk = null;

if (location.protocol === 'file:') {
  $notice.style.display    = 'block';
  $sdkTxt.textContent      = 'NEEDS HTTP SERVER';
  $sdkTxt.style.color      = 'var(--warn)';
  $sdkDot.style.background = 'var(--warn)';
}

try {
  sdk = await createC2pa();
  $sdkDot.classList.add('ok');
  $sdkTxt.textContent = 'C2PA SDK READY';
  $sdkTxt.style.color = 'var(--accent)';
  $notice.style.display = 'none';
} catch (e) {
  $sdkDot.classList.add('err');
  $sdkTxt.textContent = 'SDK FAILED';
  $sdkTxt.style.color = 'var(--danger)';
  console.error('[C2PA SDK]', e);
}

// ─── State ────────────────────────────────────────────────────
let currentFile    = null;
let currentDataURL = '';

// ─── Event Listeners ──────────────────────────────────────────
$dz.addEventListener('dragover',  e => { e.preventDefault(); $dz.classList.add('over'); });
$dz.addEventListener('dragleave', ()  => $dz.classList.remove('over'));
$dz.addEventListener('drop',      e  => {
  e.preventDefault();
  $dz.classList.remove('over');
  onFile(e.dataTransfer.files[0]);
});
$fi.addEventListener('change',  () => onFile($fi.files[0]));
$ch.addEventListener('click',   e  => { e.stopPropagation(); reset(); });
$go.addEventListener('click',   ()  => analyse());

// ─── File Handling ────────────────────────────────────────────
function onFile(file) {
  if (!file) return;
  currentFile = file;

  const fr = new FileReader();
  fr.onload = e => { currentDataURL = e.target.result; $pim.src = currentDataURL; };
  fr.readAsDataURL(file);

  $pnm.textContent   = file.name;
  $pmeta.textContent = `${(file.size/1024).toFixed(1)} KB · ${file.type||'unknown'} · ${new Date(file.lastModified).toLocaleDateString()}`;
  
  $dze.style.display = 'none';
  $prev.classList.add('on');
  $dz.classList.add('filled');
  $go.disabled = false;
  
  $rep.classList.remove('on');
  $scan.classList.remove('on');
}

// ─── Analysis Flow ────────────────────────────────────────────
const STEPS = [
  'Scanning Metadata',
  'Parsing Manifest',
  'Verifying Signature',
  'Generating Report',
];

async function analyse() {
  if (!currentFile || !sdk) {
    if (!sdk) alert('SDK not loaded. Cannot analyze.');
    return;
  }

  $go.disabled = true;
  $rep.classList.remove('on');
  $rep.innerHTML = '';
  $scan.classList.add('on');

  try {
    // Render Steps
    $sl.innerHTML = STEPS.map((s, i) =>
      `<div class="step" id="st${i}"><div class="sdot"></div><span>${esc(s)}</span></div>`
    ).join('');

    let cur = 0;
    const adv = () => {
      if (cur > 0) {
        const p = document.getElementById(`st${cur-1}`);
        p?.classList.remove('active'); p?.classList.add('done');
      }
      const c = document.getElementById(`st${cur}`); 
      if(c) c.classList.add('active');
      
      $pf.style.width   = Math.round(((cur+1)/STEPS.length)*100) + '%';
      $slbl.textContent = STEPS[cur].toUpperCase() + '…';
      cur++;
    };

    // Simulate progress steps
    adv(); await delay(100);
    adv(); await delay(100);
    adv(); await delay(100);

    // Run Analysis
    const result = await analyseFile(currentFile, sdk, Exifr);
    currentDataURL = result.dataURL;

    adv(); await delay(200);

    // Finish Steps
    const last = document.getElementById(`st${STEPS.length-1}`);
    last?.classList.remove('active'); last?.classList.add('done');
    await delay(250);

    // Show Report
    $scan.classList.remove('on');
    renderReport(result.file, result.dataURL, result.mfst, result.exif, result.cls, result.sr, reset);

  } catch (err) {
    console.error('[analyse]', err);
    $scan.classList.remove('on');
    $rep.innerHTML = `
      <div style="background:rgba(192,57,43,.08);border:1px solid rgba(192,57,43,.3);border-radius:var(--rl);padding:1.25rem 1.5rem;font-family:var(--mono);font-size:12px;color:var(--danger);line-height:1.7">
        <div style="font-size:10px;letter-spacing:.1em;margin-bottom:8px">ANALYSIS ERROR</div>
        <div>${esc(err.message || String(err))}</div>
      </div>
      <div class="brow"><button class="btn" id="errRstBtn">↺ Try another image</button></div>`;
    $rep.classList.add('on');
    document.getElementById('errRstBtn')?.addEventListener('click', reset);
    $go.disabled = false;
  }
}

// ─── Reset ────────────────────────────────────────────────────
function reset() {
  currentFile = null; 
  currentDataURL = '';
  $fi.value = ''; 
  $pim.src = '';
  $prev.classList.remove('on');
  $dze.style.display = '';
  $dz.classList.remove('filled');
  $go.disabled = true;
  $rep.classList.remove('on'); 
  $rep.innerHTML = '';
  $scan.classList.remove('on');
}
