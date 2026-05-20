// ─────────────────────────────────────────────────────────────
// gallery.js — batch processing and gallery view (revised)
//
// Updated for the revised Trust Indicator Framework:
//   Tier 1: Verified / Edited / AI Generated / No Provenance
//   Tier 2: Camera-originated / Processed / Synthetic / Unknown
//   Tier 3: Strong / Partial / No provenance
// ─────────────────────────────────────────────────────────────
import { analyseFile } from './analyser.js';
import { makeEmblem } from './emblem.js';
import { esc } from './utils.js';

// ─── State ────────────────────────────────────────────────────
let galleryItems = [];
let selectedItems = new Set();
let isProcessing = false;

// ─── DOM refs ─────────────────────────────────────────────────
const $galleryDz = document.getElementById('galleryDz');
const $galleryFi = document.getElementById('galleryFi');
const $galleryGrid = document.getElementById('galleryGrid');
const $galleryProgress = document.getElementById('galleryProgress');
const $gpLabel = document.getElementById('gpLabel');
const $gpCount = document.getElementById('gpCount');
const $gpFill = document.getElementById('gpFill');
const $galleryStats = document.getElementById('galleryStats');
const $galleryFilter = document.getElementById('galleryFilter');
const $gallerySort = document.getElementById('gallerySort');
const $galleryClearBtn = document.getElementById('galleryClearBtn');
const $galleryCompare = document.getElementById('galleryCompare');
const $gcCloseBtn = document.getElementById('gcCloseBtn');

// ─── Verdict categories (mapped to revised tier1 classifications) ─
const VERDICT_CATEGORIES = {
  verified:      'verified',
  edited:        'edited',
  aiGenerated:   'ai',
  unverified:    'unverified',
  no_provenance: 'unknown',
};

const VERDICT_LABELS = {
  verified:    'Verified',
  edited:      'Edited',
  ai:          'AI Generated',
  unverified:  'Unverified',
  unknown:     'No Provenance',
  camera:      'Camera',
  processed:   'Processed',
  synthetic:   'Synthetic',
};

// Secondary filter options for gallery (populated via select options in HTML)
const CATEGORY_GROUPS = {
  verified: 'verified',
  edited: 'edited',
  ai: 'ai',
  camera: 'camera',
  processed: 'processed',
  unverified: 'unverified',
  unknown: 'unknown',
};

// ─── Initialize ───────────────────────────────────────────────
export function initGallery(sdk, Exifr) {
  // Drag and drop
  $galleryDz.addEventListener('dragover', e => {
    e.preventDefault();
    $galleryDz.classList.add('over');
  });
  $galleryDz.addEventListener('dragleave', () => {
    $galleryDz.classList.remove('over');
  });
  $galleryDz.addEventListener('drop', e => {
    e.preventDefault();
    $galleryDz.classList.remove('over');
    handleFiles(e.dataTransfer.files, sdk, Exifr);
  });

  // File input
  $galleryFi.addEventListener('change', () => {
    handleFiles($galleryFi.files, sdk, Exifr);
  });

  // Filter and sort
  $galleryFilter.addEventListener('change', renderGallery);
  $gallerySort.addEventListener('change', renderGallery);

  // Clear gallery
  $galleryClearBtn.addEventListener('click', clearGallery);

  // Close comparison
  $gcCloseBtn.addEventListener('click', closeCompare);
}

// ─── Handle files ─────────────────────────────────────────────
async function handleFiles(files, sdk, Exifr) {
  if (!files.length || isProcessing) return;

  // Filter for image files
  const imageFiles = Array.from(files).filter(f =>
    f.type.startsWith('image/')
  );

  if (!imageFiles.length) {
    alert('No image files found in the selected folder.');
    return;
  }

  isProcessing = true;
  $galleryProgress.style.display = 'block';
  $galleryStats.style.display = 'none';

  const total = imageFiles.length;
  let processed = 0;

  for (const file of imageFiles) {
    // Check if already in gallery
    if (galleryItems.some(item => item.file.name === file.name && item.file.size === file.size)) {
      processed++;
      updateProgress(processed, total);
      continue;
    }

    try {
      const result = await analyseFile(file, sdk, Exifr);
      const category = getCategory(result.cls);

      galleryItems.push({
        id: Date.now() + Math.random(),
        file,
        dataURL: result.dataURL,
        cls: result.cls,
        category,
        timestamp: file.lastModified,
        size: file.size,
      });
    } catch (err) {
      console.error('[Gallery] Error analyzing', file.name, err);
      // Add as unknown on error
      galleryItems.push({
        id: Date.now() + Math.random(),
        file,
        dataURL: await fileToDataURL(file),
        cls: {
          tier1: { classification: 'no_provenance', label: 'No Provenance' },
          tier2: { indicator: 'unknown', label: 'Origin unknown' },
          tier3: { confidence: 'none', label: 'No provenance data' },
          tier: 3, verdict: 'no_provenance', verdictLabel: 'No provenance data', colorClass: 'cgrey'
        },
        category: 'unknown',
        timestamp: file.lastModified,
        size: file.size,
        error: err.message,
      });
    }

    processed++;
    updateProgress(processed, total);
  }

  isProcessing = false;
  $galleryProgress.style.display = 'none';
  $galleryStats.style.display = 'flex';

  renderGallery();
  updateStats();
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = e => resolve(e.target.result);
    fr.onerror = () => reject(new Error('FileReader failed'));
    fr.readAsDataURL(file);
  });
}

/** Derive a gallery category from the three-tier classification */
function getCategory(cls) {
  // Primary: tier1 classification
  const t1 = cls.tier1?.classification;
  if (t1 === 'verified') return 'verified';
  if (t1 === 'edited') return 'edited';
  if (t1 === 'aiGenerated') return 'ai';

  // Fallback: tier2 indicator
  const t2 = cls.tier2?.indicator;
  if (t2 === 'camera') return 'camera';
  if (t2 === 'processed') return 'edited';

  return 'unknown';
}

// ─── Render gallery ───────────────────────────────────────────
function renderGallery() {
  const filter = $galleryFilter.value;
  const sort = $gallerySort.value;

  // Filter
  let items = [...galleryItems];
  if (filter !== 'all') {
    items = items.filter(item => item.category === filter);
  }

  // Sort
  items.sort((a, b) => {
    switch (sort) {
      case 'name':
        return a.file.name.localeCompare(b.file.name);
      case 'date':
        return b.timestamp - a.timestamp;
      case 'size':
        return b.size - a.size;
      case 'tier':
        return (a.cls.tier1?.classification ? 0 : (a.cls.tier2?.indicator ? 1 : 2)) -
               (b.cls.tier1?.classification ? 0 : (b.cls.tier2?.indicator ? 1 : 2));
      default:
        return 0;
    }
  });

  // Render
  if (items.length === 0) {
    $galleryGrid.innerHTML = `
      <div class="gallery-empty" style="grid-column: 1 / -1">
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="8" y="8" width="48" height="48" rx="4"/>
          <circle cx="24" cy="24" r="6"/>
          <path d="M8 48l16-16 8 8 12-12"/>
        </svg>
        <p>No images to display</p>
        <small>${filter !== 'all' ? 'Try a different filter' : 'Upload a folder to get started'}</small>
      </div>
    `;
    return;
  }

  function getVerdictLabel(item) {
    if (item.cls.tier1?.label) return item.cls.tier1.label;
    if (item.cls.tier2?.label) return item.cls.tier2.label;
    return item.cls.tier3?.label || 'Unknown';
  }

  $galleryGrid.innerHTML = items.map(item => `
    <div class="gallery-item ${selectedItems.has(item.id) ? 'selected' : ''}" data-id="${item.id}">
      <img class="gallery-item-img" src="${esc(item.dataURL)}" alt="${esc(item.file.name)}">
      <div class="gallery-item-emblem">${makeEmblem(item.cls, true)}</div>
      <div class="gallery-item-info">
        <div class="gallery-item-name" title="${esc(item.file.name)}">${esc(item.file.name)}</div>
        <div class="gallery-item-meta">
          <span>${(item.file.size / 1024).toFixed(1)} KB</span>
          <span>${getVerdictLabel(item)}</span>
        </div>
        <div class="gallery-item-verdict ${item.category}">${VERDICT_LABELS[item.category] || item.category}</div>
      </div>
    </div>
  `).join('');

  // Add click handlers
  $galleryGrid.querySelectorAll('.gallery-item').forEach(el => {
    el.addEventListener('click', () => {
      const id = parseFloat(el.dataset.id);
      handleItemClick(id, items);
    });
  });
}

function handleItemClick(id, items) {
  const item = items.find(i => i.id === id);
  if (!item) return;

  // If already selected, open comparison
  if (selectedItems.has(id)) {
    selectedItems.delete(id);
    renderGallery();
    return;
  }

  // If one item selected, open comparison
  if (selectedItems.size === 1) {
    const otherId = selectedItems.values().next().value;
    const otherItem = galleryItems.find(i => i.id === otherId);
    if (otherItem) {
      openCompare(otherItem, item);
      selectedItems.clear();
      renderGallery();
      return;
    }
  }

  // Select this item
  selectedItems.add(id);
  renderGallery();
}

// ─── Update stats ─────────────────────────────────────────────
function updateStats() {
  const stats = {
    total: galleryItems.length,
    verified: galleryItems.filter(i => i.category === 'verified').length,
    edited: galleryItems.filter(i => i.category === 'edited').length,
    ai: galleryItems.filter(i => i.category === 'ai').length,
    camera: galleryItems.filter(i => i.category === 'camera').length,
    unknown: galleryItems.filter(i => i.category === 'unknown').length,
  };

  document.getElementById('gsTotal').textContent = stats.total;
  document.getElementById('gsVerified').textContent = stats.verified;
  document.getElementById('gsEdited').textContent = stats.edited;
  document.getElementById('gsAi').textContent = stats.ai;
  document.getElementById('gsCamera').textContent = stats.camera;
  document.getElementById('gsUnknown').textContent = stats.unknown;
}

// ─── Clear gallery ─────────────────────────────────────────────
function clearGallery() {
  if (galleryItems.length === 0) return;
  if (!confirm('Clear all images from the gallery?')) return;

  galleryItems = [];
  selectedItems.clear();
  renderGallery();
  updateStats();
  $galleryStats.style.display = 'none';
}

// ─── Comparison panel ─────────────────────────────────────────
function openCompare(item1, item2) {
  document.getElementById('gcLeftImg').src = item1.dataURL;
  document.getElementById('gcLeftImg').alt = item1.file.name;
  document.getElementById('gcLeftEmblem').innerHTML = makeEmblem(item1.cls);
  document.getElementById('gcLeftName').textContent = item1.file.name;
  document.getElementById('gcLeftVerdict').textContent = getItemVerdict(item1.cls);

  document.getElementById('gcRightImg').src = item2.dataURL;
  document.getElementById('gcRightImg').alt = item2.file.name;
  document.getElementById('gcRightEmblem').innerHTML = makeEmblem(item2.cls);
  document.getElementById('gcRightName').textContent = item2.file.name;
  document.getElementById('gcRightVerdict').textContent = getItemVerdict(item2.cls);

  // Generate diff
  const diff = generateDiff(item1, item2);
  document.getElementById('gcDiff').innerHTML = diff;

  $galleryCompare.style.display = 'flex';
}

/** Display-friendly verdict string using the revised three-tier labels */
function getItemVerdict(cls) {
  const parts = [];
  if (cls.tier1?.label) parts.push(`Trust: ${cls.tier1.label}`);
  if (cls.tier2?.label) parts.push(`Origin: ${cls.tier2.label}`);
  if (cls.tier3?.label) parts.push(`Provenance: ${cls.tier3.label}`);
  return parts.join(' · ') || cls.verdictLabel || 'Unknown';
}

function closeCompare() {
  $galleryCompare.style.display = 'none';
}

function generateDiff(item1, item2) {
  const diffs = [];

  // Tier 1 comparison
  const t1a = item1.cls.tier1?.classification || item1.cls.verdict;
  const t1b = item2.cls.tier1?.classification || item2.cls.verdict;
  if (t1a !== t1b) {
    diffs.push(`<strong>Trust classification:</strong> ${item1.cls.tier1?.label || t1a} vs ${item2.cls.tier1?.label || t1b}`);
  }

  // Tier 2 comparison
  const t2a = item1.cls.tier2?.indicator;
  const t2b = item2.cls.tier2?.indicator;
  if (t2a !== t2b) {
    diffs.push(`<strong>Origin type:</strong> ${item1.cls.tier2?.label || t2a} vs ${item2.cls.tier2?.label || t2b}`);
  }

  // Tier 3 comparison
  const t3a = item1.cls.tier3?.confidence;
  const t3b = item2.cls.tier3?.confidence;
  if (t3a !== t3b) {
    diffs.push(`<strong>Provenance confidence:</strong> ${item1.cls.tier3?.label || t3a} vs ${item2.cls.tier3?.label || t3b}`);
  }

  // File size comparison
  const sizeDiff = Math.abs(item1.size - item2.size);
  const sizePercent = ((sizeDiff / Math.max(item1.size, item2.size)) * 100).toFixed(1);
  if (sizePercent > 10) {
    const larger = item1.size > item2.size ? item1 : item2;
    const smaller = item1.size > item2.size ? item2 : item1;
    diffs.push(`<strong>Size difference:</strong> ${larger.file.name} is ${sizePercent}% larger (${(larger.size / 1024).toFixed(1)} KB vs ${(smaller.size / 1024).toFixed(1)} KB)`);
  }

  // Timestamp comparison
  const date1 = new Date(item1.timestamp);
  const date2 = new Date(item2.timestamp);
  const daysDiff = Math.abs((date1 - date2) / (1000 * 60 * 60 * 24));
  if (daysDiff > 1) {
    diffs.push(`<strong>Date difference:</strong> ${date1.toLocaleDateString()} vs ${date2.toLocaleDateString()} (${Math.round(daysDiff)} days apart)`);
  }

  if (diffs.length === 0) {
    return '<em>These images have similar provenance characteristics.</em>';
  }

  return diffs.map(d => `<div>${d}</div>`).join('');
}

// ─── Export for external use ───────────────────────────────────
export { galleryItems, clearGallery };