// ─────────────────────────────────────────────────────────────
// forensics.js — pixel-level forensic analysis (HTML5 Canvas API)
//
// All analysis runs entirely in the browser.
// No image data is transmitted to any server.
// Results are probabilistic indicators — not forensic proof.
//
// Exports:
//   runForensics(dataURL, mimeType) → Promise<ForensicsResult>
//
// ForensicsResult shape:
//   { ela, clone, noise, ai }
//   ela   — Error Level Analysis
//   clone — Clone/Copy Detection
//   noise — Noise Consistency Map
//   ai    — AI Detection (derived from noise statistics)
// ─────────────────────────────────────────────────────────────

/** Max working dimension for clone/noise analysis (px on longest side) */
const MAX_WORK_PX = 800;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run all four forensic analyses on a loaded image.
 * @param {string} dataURL  — image data URL (any format)
 * @param {string} mimeType — original MIME type (e.g. "image/png")
 * @returns {Promise<{ela, clone, noise, ai}>}
 */
export async function runForensics(dataURL, mimeType, rawInfo = null) {
  let img;
  try {
    img = await _loadImage(dataURL);
  } catch (e) {
    // Raw formats that the browser cannot render natively return a descriptive result
    // so the renderer can show an informative notice instead of silently hiding forensics.
    if (rawInfo) {
      return { rawNotRenderable: true, rawInfo };
    }
    return { error: "Could not load image for forensic analysis." };
  }

  try {
    // ELA runs at full resolution; clone/noise use a downscaled working copy
    const [elaResult, cloneResult, noiseResult] = await Promise.all([
      _runELA(img, mimeType, rawInfo),
      _runCloneDetection(img),
      _runNoiseAnalysis(img),
    ]);

    const aiResult = _deriveAIDetection(noiseResult);

    return {
      ela: elaResult,
      clone: cloneResult,
      noise: noiseResult,
      ai: aiResult,
    };
  } catch (e) {
    console.warn("[forensics]", e);
    return { error: String(e) };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function _loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = src;
  });
}

/**
 * Create a working canvas, downscaled if the image exceeds MAX_WORK_PX.
 */
function _workingCanvas(img, maxPx = MAX_WORK_PX) {
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  const scale = Math.min(1, maxPx / Math.max(nw, nh, 1));
  const w = Math.max(1, Math.round(nw * scale));
  const h = Math.max(1, Math.round(nh * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  c.getContext("2d").drawImage(img, 0, 0, w, h);
  return { canvas: c, ctx: c.getContext("2d"), w, h, scale };
}

// ─── ELA ─────────────────────────────────────────────────────────────────────

async function _runELA(img, mimeType, rawInfo = null) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  // Raw formats are treated as lossless (no prior JPEG compression cycle).
  // Also catches raw MIME types when the browser passes them directly.
  const rawMimePattern =
    /heic|heif|dng|arw|nef|cr[23r]|raf|rw2|orf|pef|sr[12f]|\.raw/.test(
      (mimeType || "").toLowerCase(),
    );
  const isLossless =
    rawInfo?.lossless ||
    rawMimePattern ||
    /png|webp|bmp|gif/.test((mimeType || "").toLowerCase());

  // Draw original at full size
  const origC = document.createElement("canvas");
  origC.width = w;
  origC.height = h;
  const origCtx = origC.getContext("2d");
  origCtx.drawImage(img, 0, 0);
  const origPx = origCtx.getImageData(0, 0, w, h).data;

  // Re-compress to JPEG quality 75 then reload
  const jpegURL = origC.toDataURL("image/jpeg", 0.75);
  const reImg = await _loadImage(jpegURL);
  const reC = document.createElement("canvas");
  reC.width = w;
  reC.height = h;
  const reCtx = reC.getContext("2d");
  reCtx.drawImage(reImg, 0, 0);
  const rePx = reCtx.getImageData(0, 0, w, h).data;

  // Compute ELA heatmap (amplified ×12)
  const elaC = document.createElement("canvas");
  elaC.width = w;
  elaC.height = h;
  const elaCtx = elaC.getContext("2d");
  const elaImg = elaCtx.createImageData(w, h);

  const AMP = 12;
  const HIGH_THR = 20;
  let total = 0,
    maxV = 0,
    highCount = 0;

  for (let i = 0; i < origPx.length; i += 4) {
    const dr = Math.abs(origPx[i] - rePx[i]);
    const dg = Math.abs(origPx[i + 1] - rePx[i + 1]);
    const db = Math.abs(origPx[i + 2] - rePx[i + 2]);
    const ela = (dr + dg + db) / 3;
    total += ela;
    if (ela > maxV) maxV = ela;
    if (ela > HIGH_THR) highCount++;
    elaImg.data[i] = Math.min(255, dr * AMP);
    elaImg.data[i + 1] = Math.min(255, dg * AMP);
    elaImg.data[i + 2] = Math.min(255, db * AMP);
    elaImg.data[i + 3] = 255;
  }
  elaCtx.putImageData(elaImg, 0, 0);

  const px = w * h;
  const avgELA = total / px;
  const highPct = (highCount / px) * 100;

  // Risk scoring (lossless-aware)
  let risk = 0;
  if (!isLossless) {
    if (avgELA > 8) risk += 40;
    else if (avgELA > 4) risk += 18;
    if (highPct > 5) risk += 35;
    else if (highPct > 2) risk += 15;
    if (maxV > 60) risk += 25;
    else if (maxV > 35) risk += 12;
  } else {
    risk = Math.min(25, Math.round(highPct * 3));
  }
  risk = Math.min(100, risk);

  let verdict, verdictType;
  if (isLossless) {
    verdict = rawInfo
      ? `ELA running on ${rawInfo.label} source \u2014 elevated baseline is expected. Results are indicative only.`
      : "ELA elevated due to lossless\u2192JPEG conversion. No clear manipulation signal.";
    verdictType = "info";
  } else if (risk < 25) {
    verdict = "No suspicious compression artifacts detected.";
    verdictType = "pass";
  } else if (risk < 55) {
    verdict =
      "Moderate ELA anomalies found. Some regions may have been re-edited.";
    verdictType = "warn";
  } else {
    verdict =
      "High ELA anomalies detected. Significant re-editing or compositing suspected.";
    verdictType = "fail";
  }

  return {
    visualURL: elaC.toDataURL(),
    maxELA: +maxV.toFixed(2),
    avgELA: +avgELA.toFixed(2),
    highELAPct: +highPct.toFixed(2),
    isLossless,
    sourceFormat: rawInfo
      ? rawInfo.label
      : isLossless
        ? "Lossless (PNG/WebP)"
        : "JPEG",
    risk,
    verdict,
    verdictType,
  };
}

// ─── Clone / Copy Detection ───────────────────────────────────────────────────

function _runCloneDetection(img) {
  const BLOCK = 32;
  const MIN_DIST = 4; // minimum distance in blocks between a matched pair

  const { canvas, w, h } = _workingCanvas(img);
  const ctx = canvas.getContext("2d");
  const px = ctx.getImageData(0, 0, w, h).data;

  const cols = Math.floor(w / BLOCK);
  const rows = Math.floor(h / BLOCK);

  if (cols < 2 || rows < 2) {
    return {
      visualURL: canvas.toDataURL(),
      matchingPairs: 0,
      suspiciousBlocks: 0,
      blockSize: `${BLOCK}×${BLOCK} px`,
      gridSize: `${cols}×${rows} = ${cols * rows} blocks`,
      risk: 0,
      verdict: "Image too small for clone detection.",
      verdictType: "info",
    };
  }

  // Compute fingerprints (mean R,G,B per quadrant → 12 values each)
  const fps = [];
  const coords = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      fps.push(_blockFingerprint(px, w, c * BLOCK, r * BLOCK, BLOCK));
      coords.push({ x: c * BLOCK, y: r * BLOCK, col: c, row: r });
    }
  }

  // Find matching pairs
  const THRESH = 10;
  const matches = [];
  const suspicious = new Set();

  outer: for (let i = 0; i < fps.length; i++) {
    for (let j = i + 1; j < fps.length; j++) {
      const dc = Math.abs(coords[i].col - coords[j].col);
      const dr = Math.abs(coords[i].row - coords[j].row);
      if (Math.sqrt(dc * dc + dr * dr) < MIN_DIST) continue;
      if (_euclidean(fps[i], fps[j]) < THRESH) {
        matches.push({ i, j });
        suspicious.add(i);
        suspicious.add(j);
        if (matches.length >= 80) break outer;
      }
    }
  }

  // Draw overlay on a clone of the display canvas
  const dispC = document.createElement("canvas");
  dispC.width = w;
  dispC.height = h;
  const dispCtx = dispC.getContext("2d");
  dispCtx.drawImage(canvas, 0, 0);

  const COLORS = [
    "#e74c3c",
    "#3498db",
    "#2ecc71",
    "#f39c12",
    "#9b59b6",
    "#1abc9c",
    "#e67e22",
    "#e91e63",
    "#00bcd4",
    "#8bc34a",
    "#ff5722",
    "#607d8b",
    "#795548",
    "#ff9800",
    "#4caf50",
  ];

  const shown = Math.min(matches.length, 15);
  for (let m = 0; m < shown; m++) {
    const color = COLORS[m % COLORS.length];
    for (const idx of [matches[m].i, matches[m].j]) {
      const { x, y } = coords[idx];
      dispCtx.strokeStyle = color;
      dispCtx.lineWidth = 2;
      dispCtx.strokeRect(x, y, BLOCK, BLOCK);
      dispCtx.fillStyle = color + "55";
      dispCtx.fillRect(x, y, BLOCK, BLOCK);
    }
  }

  const mc = matches.length;
  const sc = suspicious.size;

  let risk = 0;
  if (mc > 30) risk = 95;
  else if (mc > 15) risk = 80;
  else if (mc > 5) risk = 55;
  else if (mc > 2) risk = 30;

  let verdict, verdictType;
  if (risk >= 70) {
    verdict = `${mc} matching block pairs found (${sc} blocks). Colored regions show potential copy-paste pairs.`;
    verdictType = "fail";
  } else if (risk >= 35) {
    verdict = `${mc} matching block pairs found — possible copy-paste activity or uniform regions.`;
    verdictType = "warn";
  } else if (mc > 0) {
    verdict = `${mc} block pair(s) matched. Likely uniform-color regions rather than deliberate cloning.`;
    verdictType = "info";
  } else {
    verdict = "No significant copy-paste cloning detected.";
    verdictType = "pass";
  }

  return {
    visualURL: dispC.toDataURL(),
    matchingPairs: mc,
    suspiciousBlocks: sc,
    blockSize: `${BLOCK}×${BLOCK} px`,
    gridSize: `${cols}×${rows} = ${cols * rows} blocks`,
    risk,
    verdict,
    verdictType,
  };
}

function _blockFingerprint(data, imgW, bx, by, bs) {
  const half = Math.floor(bs / 2);
  const quads = [
    [0, 0],
    [half, 0],
    [0, half],
    [half, half],
  ];
  const fp = [];
  for (const [qx, qy] of quads) {
    let r = 0,
      g = 0,
      b = 0,
      n = 0;
    for (let y = by + qy; y < by + qy + half; y++) {
      for (let x = bx + qx; x < bx + qx + half; x++) {
        const i = (y * imgW + x) * 4;
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        n++;
      }
    }
    fp.push(r / n, g / n, b / n);
  }
  return fp;
}

function _euclidean(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

// ─── Noise Consistency Analysis ───────────────────────────────────────────────

function _runNoiseAnalysis(img) {
  const BLOCK = 32;
  const { canvas, ctx, w, h } = _workingCanvas(img);
  const px = ctx.getImageData(0, 0, w, h).data;

  const cols = Math.floor(w / BLOCK);
  const rows = Math.floor(h / BLOCK);

  if (cols < 2 || rows < 2) {
    return {
      visualURL: canvas.toDataURL(),
      medianNoise: 0,
      maxNoise: 0,
      outlierCount: 0,
      outlierPct: 0,
      gridSize: `${cols}×${rows}`,
      inconsistencyScore: 0,
      verdict: "Image too small for noise analysis.",
      verdictType: "info",
      kurtosis: 3,
      textureCV: 0.5,
    };
  }

  // Compute per-block noise (std-dev of grayscale residuals)
  const blocks = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const noise = _blockNoise(px, w, c * BLOCK, r * BLOCK, BLOCK);
      blocks.push({ x: c * BLOCK, y: r * BLOCK, noise });
    }
  }

  const sorted = [...blocks].sort((a, b) => a.noise - b.noise);
  const median = sorted[Math.floor(sorted.length / 2)].noise;
  const maxN = sorted[sorted.length - 1].noise;

  const MULT = 3;
  const outliers = blocks.filter((b) => b.noise > Math.max(median * MULT, 2));
  const outlierPct = (outliers.length / blocks.length) * 100;

  // Global kurtosis, texture diversity, and new AI signals
  const kurtosis = _globalKurtosis(px, w, h);
  const textureCV = _textureCV(px, w, h, BLOCK, cols, rows);
  const noiseUniformityRatio = _computeNoiseUniformity(
    px,
    w,
    h,
    BLOCK,
    cols,
    rows,
  );
  const smoothNoise = _computeSmoothRegionNoise(px, w, h, BLOCK, cols, rows);

  // Noise naturalness map (for AI Detection tab)
  const mapC = document.createElement("canvas");
  mapC.width = w;
  mapC.height = h;
  const mapCtx = mapC.getContext("2d");
  mapCtx.drawImage(canvas, 0, 0);
  mapCtx.globalAlpha = 0.55;

  // Per-block kurtosis for the AI detection naturalness map
  const blockKurtosis = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = _blockKurtosis(px, w, c * BLOCK, r * BLOCK, BLOCK);
      blockKurtosis.push({ x: c * BLOCK, y: r * BLOCK, k });
      // Color: k<3 red, k<5 orange, k>=5 green
      if (k < 3) mapCtx.fillStyle = "#e74c3c";
      else if (k < 5) mapCtx.fillStyle = "#e67e22";
      else mapCtx.fillStyle = "#27ae60";
      mapCtx.fillRect(c * BLOCK, r * BLOCK, BLOCK, BLOCK);
    }
  }
  mapCtx.globalAlpha = 1;
  const naturalMapURL = mapC.toDataURL();

  // Noise consistency overlay
  const noiseC = document.createElement("canvas");
  noiseC.width = w;
  noiseC.height = h;
  const noiseCtx = noiseC.getContext("2d");
  noiseCtx.drawImage(canvas, 0, 0);

  for (const b of outliers) {
    const intensity = Math.min(
      1,
      (b.noise - median * MULT) / (maxN - median * MULT + 0.001),
    );
    noiseCtx.fillStyle =
      intensity > 0.5
        ? `rgba(220,53,69,${0.3 + intensity * 0.4})`
        : `rgba(255,193,7,${0.3 + intensity * 0.3})`;
    noiseCtx.strokeStyle =
      intensity > 0.5 ? "rgba(220,53,69,0.8)" : "rgba(255,193,7,0.6)";
    noiseCtx.lineWidth = 1.5;
    noiseCtx.fillRect(b.x, b.y, BLOCK, BLOCK);
    noiseCtx.strokeRect(b.x, b.y, BLOCK, BLOCK);
  }

  const inconsistencyScore = Math.min(100, Math.round(outlierPct * 8));

  let verdict, verdictType;
  if (inconsistencyScore >= 50) {
    verdict = `Noise inconsistency detected — ${outliers.length} blocks (${outlierPct.toFixed(1)}%) show significantly different noise levels. Red areas may originate from a different source image.`;
    verdictType = "warn";
  } else if (inconsistencyScore >= 20) {
    verdict = `Mild noise variation — ${outliers.length} outlier blocks. May indicate light editing or a high-dynamic-range scene.`;
    verdictType = "info";
  } else {
    verdict =
      "Noise levels appear consistent across the image. No significant splicing detected.";
    verdictType = "pass";
  }

  return {
    visualURL: noiseC.toDataURL(),
    naturalMapURL,
    medianNoise: +median.toFixed(2),
    maxNoise: +maxN.toFixed(2),
    outlierCount: outliers.length,
    outlierPct: +outlierPct.toFixed(1),
    gridSize: `${cols}×${rows}`,
    inconsistencyScore,
    verdict,
    verdictType,
    kurtosis: +kurtosis.toFixed(2),
    textureCV: +textureCV.toFixed(2),
    noiseUniformityRatio,
    smoothNoise,
  };
}

function _blockNoise(data, imgW, bx, by, bs) {
  let sum = 0,
    n = 0;
  const vals = [];
  for (let y = by; y < by + bs; y++)
    for (let x = bx; x < bx + bs; x++) {
      const i = (y * imgW + x) * 4;
      const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      vals.push(g);
      sum += g;
      n++;
    }
  const mean = sum / n;
  const variance = vals.reduce((a, v) => a + (v - mean) ** 2, 0) / n;
  return Math.sqrt(variance);
}

/**
 * Per-block kurtosis using horizontal high-pass residuals.
 * This is consistent with _globalKurtosis and actually measures noise statistics,
 * NOT texture/contrast (which is what raw pixel kurtosis measures and is meaningless).
 * Natural camera noise residuals are heavy-tailed (kurtosis > 3).
 * Smooth AI regions have near-Gaussian residuals (kurtosis ≈ 3 or slightly less).
 */
function _blockKurtosis(data, imgW, bx, by, bs) {
  const res = [];
  for (let y = by; y < by + bs; y++) {
    // Skip first and last column of each block (need neighbours)
    for (let x = bx + 1; x < bx + bs - 1; x++) {
      const i = (y * imgW + x) * 4;
      const li = (y * imgW + (x - 1)) * 4;
      const ri = (y * imgW + (x + 1)) * 4;
      const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const gl = 0.299 * data[li] + 0.587 * data[li + 1] + 0.114 * data[li + 2];
      const gr = 0.299 * data[ri] + 0.587 * data[ri + 1] + 0.114 * data[ri + 2];
      res.push(g - (gl + gr) / 2);
    }
  }
  if (res.length < 8) return 3;
  const mean = res.reduce((a, b) => a + b, 0) / res.length;
  const variance = res.reduce((a, b) => a + (b - mean) ** 2, 0) / res.length;
  const std = Math.sqrt(variance);
  // If std is near zero the block is completely flat — residuals carry no information
  if (std < 0.05) return 3;
  return res.reduce((a, b) => a + ((b - mean) / std) ** 4, 0) / res.length;
}

function _globalKurtosis(data, w, h) {
  const STEP = 4;
  const res = [];
  for (let y = STEP; y < h - STEP; y += STEP) {
    for (let x = STEP; x < w - STEP; x += STEP) {
      const i = (y * w + x) * 4;
      const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const li = (y * w + (x - STEP)) * 4;
      const ri = (y * w + (x + STEP)) * 4;
      const gl = 0.299 * data[li] + 0.587 * data[li + 1] + 0.114 * data[li + 2];
      const gr = 0.299 * data[ri] + 0.587 * data[ri + 1] + 0.114 * data[ri + 2];
      res.push(g - (gl + gr) / 2);
    }
  }
  const mean = res.reduce((a, b) => a + b, 0) / res.length;
  const variance = res.reduce((a, b) => a + (b - mean) ** 2, 0) / res.length;
  const std = Math.sqrt(variance);
  if (std < 0.001) return 3;
  return res.reduce((a, b) => a + ((b - mean) / std) ** 4, 0) / res.length;
}

function _textureCV(data, w, h, bs, cols, rows) {
  const contrasts = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      let mn = 255,
        mx = 0;
      for (let y = r * bs; y < r * bs + bs; y++)
        for (let x = c * bs; x < c * bs + bs; x++) {
          const i = (y * w + x) * 4;
          const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          if (g < mn) mn = g;
          if (g > mx) mx = g;
        }
      contrasts.push(mx - mn);
    }
  const mean = contrasts.reduce((a, b) => a + b, 0) / contrasts.length;
  const std = Math.sqrt(
    contrasts.reduce((a, b) => a + (b - mean) ** 2, 0) / contrasts.length,
  );
  return mean > 0 ? std / mean : 0;
}

// ─── AI Detection (derived from noise statistics) ─────────────────────────────
// ─── Noise uniformity (key AI signal) ───────────────────────────────────────────────────

/**
 * Measure whether noise level correlates with block brightness.
 * Camera sensors follow shot noise: brighter areas have MORE noise (σ ∝ √signal).
 * AI diffusion models produce more UNIFORM noise across all brightness levels.
 *
 * Returns:
 *   ratio > 1.3  — bright regions noisier than dark: consistent with real camera
 *   ratio 1.0–1.3 — borderline
 *   ratio < 1.0  — dark regions noisier or equal: suspicious (AI-like)
 *   null — insufficient data (image lacks dark or bright regions)
 */
function _computeNoiseUniformity(data, w, h, bs, cols, rows) {
  const darkNoise = [],
    brightNoise = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const bx = c * bs,
        by = r * bs;
      let sumBright = 0,
        n = 0;
      const res = [];

      for (let y = by; y < by + bs; y++) {
        for (let x = bx + 1; x < bx + bs - 1; x++) {
          const i = (y * w + x) * 4;
          const li = (y * w + (x - 1)) * 4;
          const ri = (y * w + (x + 1)) * 4;
          const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          const gl =
            0.299 * data[li] + 0.587 * data[li + 1] + 0.114 * data[li + 2];
          const gr =
            0.299 * data[ri] + 0.587 * data[ri + 1] + 0.114 * data[ri + 2];
          res.push(g - (gl + gr) / 2);
          sumBright += g;
          n++;
        }
      }
      if (n === 0 || res.length < 4) continue;

      const mb = sumBright / n;
      const mr = res.reduce((a, b) => a + b, 0) / res.length;
      const ns = Math.sqrt(
        res.reduce((a, b) => a + (b - mr) ** 2, 0) / res.length,
      );

      if (mb < 70)
        darkNoise.push(ns); // dark region
      else if (mb > 170) brightNoise.push(ns); // bright region
    }
  }

  if (darkNoise.length < 4 || brightNoise.length < 4) return null;

  const avgDark = darkNoise.reduce((a, b) => a + b, 0) / darkNoise.length;
  const avgBright = brightNoise.reduce((a, b) => a + b, 0) / brightNoise.length;
  return avgBright / (avgDark + 0.01);
}

/**
 * Measure the noise floor in smooth, low-contrast regions.
 * Real cameras: smooth areas still have sensor noise (typically 1-5 gray levels).
 * Some AI diffusion models: smooth areas can have near-zero noise floor.
 * Returns average residual std-dev in smooth blocks, or null if none found.
 */
function _computeSmoothRegionNoise(data, w, h, bs, cols, rows) {
  const levels = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const bx = c * bs,
        by = r * bs;
      // Check local contrast — only care about smooth blocks
      let mn = 255,
        mx = 0;
      for (let y = by; y < by + bs; y++) {
        for (let x = bx; x < bx + bs; x++) {
          const i = (y * w + x) * 4;
          const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          if (g < mn) mn = g;
          if (g > mx) mx = g;
        }
      }
      if (mx - mn > 25) continue; // skip textured blocks

      // Compute high-pass residual std for this smooth block
      const res = [];
      for (let y = by; y < by + bs; y++) {
        for (let x = bx + 1; x < bx + bs - 1; x++) {
          const i = (y * w + x) * 4;
          const li = (y * w + (x - 1)) * 4;
          const ri = (y * w + (x + 1)) * 4;
          const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          const gl =
            0.299 * data[li] + 0.587 * data[li + 1] + 0.114 * data[li + 2];
          const gr =
            0.299 * data[ri] + 0.587 * data[ri + 1] + 0.114 * data[ri + 2];
          res.push(g - (gl + gr) / 2);
        }
      }
      if (res.length < 4) continue;
      const mr = res.reduce((a, b) => a + b, 0) / res.length;
      const ns = Math.sqrt(
        res.reduce((a, b) => a + (b - mr) ** 2, 0) / res.length,
      );
      levels.push(ns);
    }
  }
  if (levels.length < 3) return null;
  return levels.reduce((a, b) => a + b, 0) / levels.length;
}

// ─── AI Detection (derived from noise statistics) ───────────────────────────────────────────────────

function _deriveAIDetection(noiseResult) {
  const { kurtosis, textureCV, noiseUniformityRatio, smoothNoise } =
    noiseResult;

  let aiScore = 0;
  const signals = [];

  // ── Signal 1: Noise kurtosis (high-pass residuals) ──────────────────────────
  // With the corrected high-pass method:
  //   Natural photos:   kurtosis typically 3 – 15 (heavy-tailed residuals from edges)
  //   AI smooth images: kurtosis < 3 (near-Gaussian residuals, too smooth)
  //   AI fine-detail:   kurtosis can be anywhere — this signal alone is insufficient
  if (kurtosis < 2.5) {
    aiScore += 25;
    signals.push({
      text: `Noise kurtosis ${kurtosis} \u2014 very low; residuals are unusually smooth (can indicate AI diffusion).`,
      type: "warn",
    });
  } else if (kurtosis < 3.5) {
    aiScore += 10;
    signals.push({
      text: `Noise kurtosis ${kurtosis} \u2014 slightly below the typical camera range (3.5\u201315).`,
      type: "info",
    });
  } else {
    signals.push({
      text: `Noise kurtosis ${kurtosis} \u2014 within the natural camera noise range (3.5\u201315).`,
      type: "pass",
    });
  }

  // ── Signal 2: Noise uniformity (bright vs dark regions) ─────────────────────
  // Reliable: camera shot noise causes brighter regions to have more noise.
  // AI images often skip this physics, producing flat noise across all tones.
  if (noiseUniformityRatio !== null) {
    if (noiseUniformityRatio < 0.9) {
      aiScore += 30;
      signals.push({
        text: `Noise gradient inverted (dark regions noisier than bright) \u2014 inconsistent with camera physics.`,
        type: "warn",
      });
    } else if (noiseUniformityRatio < 1.2) {
      aiScore += 18;
      signals.push({
        text: `Noise gradient flat \u2014 bright and dark regions have similar noise levels; natural cameras show brighter = noisier.`,
        type: "warn",
      });
    } else if (noiseUniformityRatio < 1.5) {
      aiScore += 5;
      signals.push({
        text: `Noise gradient slightly lower than expected \u2014 borderline natural.`,
        type: "info",
      });
    } else {
      signals.push({
        text: `Noise gradient correct \u2014 brighter areas carry more noise, consistent with sensor shot noise.`,
        type: "pass",
      });
    }
  } else {
    signals.push({
      text: `Noise gradient: insufficient dark/bright regions to evaluate shot-noise model.`,
      type: "info",
    });
  }

  // ── Signal 3: Smooth-region noise floor ──────────────────────────────────────
  // Real cameras always have a non-zero noise floor (sensor read noise + dark current).
  // Some AI images have near-zero noise in smooth areas (too perfect).
  if (smoothNoise !== null) {
    if (smoothNoise < 0.25) {
      aiScore += 20;
      signals.push({
        text: `Smooth regions have near-zero noise floor (${smoothNoise.toFixed(2)}) \u2014 real cameras always have sensor noise.`,
        type: "warn",
      });
    } else if (smoothNoise < 0.6) {
      aiScore += 8;
      signals.push({
        text: `Smooth-region noise floor low (${smoothNoise.toFixed(2)}) \u2014 slightly below typical camera range (>0.6).`,
        type: "info",
      });
    } else {
      signals.push({
        text: `Smooth-region noise floor ${smoothNoise.toFixed(2)} \u2014 consistent with natural sensor noise.`,
        type: "pass",
      });
    }
  }

  // ── Signal 4: Texture diversity ──────────────────────────────────────────────
  if (textureCV < 0.35) {
    aiScore += 15;
    signals.push({
      text: `Texture diversity CV ${textureCV} \u2014 unusually uniform; very little variation in local contrast.`,
      type: "warn",
    });
  } else if (textureCV < 0.55) {
    aiScore += 5;
    signals.push({
      text: `Texture diversity CV ${textureCV} \u2014 slightly below the typical natural range (>0.55).`,
      type: "info",
    });
  } else {
    signals.push({
      text: `Texture diversity CV ${textureCV} \u2014 natural variation across the image.`,
      type: "pass",
    });
  }

  aiScore = Math.min(100, aiScore);

  // Conservative verdicts — pixel analysis alone is inherently limited for modern AI
  let verdict, verdictType;
  if (aiScore >= 55) {
    verdict = "Suspicious pixel statistics (likely AI)";
    verdictType = "fail";
  } else if (aiScore >= 30) {
    verdict = "Mixed pixel signals \u2014 inconclusive";
    verdictType = "warn";
  } else {
    verdict = "Pixel statistics consistent with natural photo";
    verdictType = "pass";
  }

  return {
    kurtosis,
    textureCV,
    noiseUniformityRatio:
      noiseUniformityRatio != null ? +noiseUniformityRatio.toFixed(2) : null,
    smoothNoise: smoothNoise != null ? +smoothNoise.toFixed(2) : null,
    aiScore,
    verdict,
    verdictType,
    signals,
  };
}
