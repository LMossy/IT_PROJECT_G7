// ─────────────────────────────────────────────────────────────
// gallery.js — batch processing and gallery view
// ─────────────────────────────────────────────────────────────
import { analyseFile } from "./analyser.js";
import { makeEmblemFromEval } from "./emblem.js";
import { esc } from "./utils.js";

const TRUST_LABELS = {
  strong_provenance: "Strong Provenance",
  verified_with_disclosed_edits: "Verified with Disclosed Edits",
  provisionally_signed: "Provisionally Signed",
  limited_evidence: "Limited Evidence",
  inconsistent_or_suspicious: "Inconsistent or Suspicious",
  tampered: "Tampered",
  invalid_provenance: "Invalid Provenance",
  insufficient_evidence: "Insufficient Evidence",
  // Legacy alias
  invalid_or_tampered: "Invalid or Tampered",
};

let galleryItems = [];
let selectedItems = new Set();
let isProcessing = false;

const $galleryDz = document.getElementById("galleryDz");
const $galleryFi = document.getElementById("galleryFi");
const $galleryGrid = document.getElementById("galleryGrid");
const $galleryProgress = document.getElementById("galleryProgress");
const $gpLabel = document.getElementById("gpLabel");
const $gpCount = document.getElementById("gpCount");
const $gpFill = document.getElementById("gpFill");
const $galleryStats = document.getElementById("galleryStats");
const $galleryFilter = document.getElementById("galleryFilter");
const $gallerySort = document.getElementById("gallerySort");
const $galleryClearBtn = document.getElementById("galleryClearBtn");
const $galleryCompare = document.getElementById("galleryCompare");
const $gcCloseBtn = document.getElementById("gcCloseBtn");

const VERDICT_LABELS = {
  verified: "Verified",
  edited: "Edited",
  ai: "AI Generated",
  unverified: "Unverified",
  unknown: "No Provenance",
  camera: "Camera",
  processed: "Processed",
};

export function initGallery(sdk, Exifr) {
  $galleryDz.addEventListener("dragover", (e) => {
    e.preventDefault();
    $galleryDz.classList.add("over");
  });
  $galleryDz.addEventListener("dragleave", () => {
    $galleryDz.classList.remove("over");
  });
  $galleryDz.addEventListener("drop", (e) => {
    e.preventDefault();
    $galleryDz.classList.remove("over");
    handleFiles(e.dataTransfer.files, sdk, Exifr);
  });

  $galleryFi.addEventListener("change", () => {
    handleFiles($galleryFi.files, sdk, Exifr);
  });

  $galleryFilter.addEventListener("change", renderGallery);
  $gallerySort.addEventListener("change", renderGallery);
  $galleryClearBtn.addEventListener("click", clearGallery);
  $gcCloseBtn.addEventListener("click", closeCompare);
}

async function handleFiles(files, sdk, Exifr) {
  if (!files.length || isProcessing) return;

  const imageFiles = Array.from(files).filter((f) =>
    f.type.startsWith("image/"),
  );

  if (!imageFiles.length) {
    alert("No image files found in the selected folder.");
    return;
  }

  isProcessing = true;
  $galleryProgress.style.display = "block";
  $galleryStats.style.display = "none";

  const total = imageFiles.length;
  let processed = 0;

  for (const file of imageFiles) {
    if (
      galleryItems.some(
        (item) => item.file.name === file.name && item.file.size === file.size,
      )
    ) {
      processed++;
      updateProgress(processed, total);
      continue;
    }

    try {
      const result = await analyseFile(file, sdk, Exifr);
      const category = getCategory(result.evalResult);

      galleryItems.push({
        id: Date.now() + Math.random(),
        file,
        dataURL: result.dataURL,
        evalResult: result.evalResult,
        category,
        timestamp: file.lastModified,
        size: file.size,
      });
    } catch (err) {
      console.error("[Gallery] Error analyzing", file.name, err);
      const dataURL = await fileToDataURL(file);
      galleryItems.push({
        id: Date.now() + Math.random(),
        file,
        dataURL,
        evalResult: {
          provenanceStatus: "no_c2pa",
          contentEditStatus: "unknown",
          metadataSupportStatus: "metadata_missing_or_stripped",
          finalTrustJudgement: "insufficient_evidence",
          metadata: { hasC2pa: false },
        },
        category: "unknown",
        timestamp: file.lastModified,
        size: file.size,
        error: err.message,
      });
    }

    processed++;
    updateProgress(processed, total);
  }

  isProcessing = false;
  $galleryProgress.style.display = "none";
  $galleryStats.style.display = "flex";

  renderGallery();
  updateStats();
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = (e) => resolve(e.target.result);
    fr.onerror = () => reject(new Error("FileReader failed"));
    fr.readAsDataURL(file);
  });
}

/** Derive a gallery filter category from the multi-dimensional evaluation */
function getCategory(evalResult) {
  const { provenanceStatus, contentEditStatus, finalTrustJudgement } =
    evalResult;

  // New taxonomy
  if (
    provenanceStatus === "c2pa_fully_verified" ||
    provenanceStatus === "c2pa_signed_unverified_cert"
  ) {
    if (contentEditStatus === "ai_generated") return "ai";
    if (contentEditStatus === "disclosed_edits") return "edited";
    return "verified";
  }
  if (
    provenanceStatus === "c2pa_tampered" ||
    provenanceStatus === "c2pa_invalid"
  )
    return "unverified";
  // Legacy taxonomy (backward compat)
  if (provenanceStatus === "c2pa_verified") {
    if (
      contentEditStatus === "ai_generated" ||
      contentEditStatus === "ai_generated_or_synthetic"
    )
      return "ai";
    if (contentEditStatus === "disclosed_edits") return "edited";
    return "verified";
  }
  if (provenanceStatus === "c2pa_invalid_or_tampered") return "unverified";
  // Shared
  if (contentEditStatus === "original_or_camera_capture") return "camera";
  if (contentEditStatus === "suspected_undisclosed_editing") return "processed";
  if (finalTrustJudgement === "limited_evidence") return "camera";
  return "unknown";
}

function updateProgress(done, total) {
  $gpLabel.textContent = "Processing images…";
  $gpCount.textContent = `${done} / ${total}`;
  $gpFill.style.width = `${Math.round((done / total) * 100)}%`;
}

function renderGallery() {
  const filter = $galleryFilter.value;
  const sort = $gallerySort.value;

  let items = [...galleryItems];
  if (filter !== "all") {
    items = items.filter((item) => item.category === filter);
  }

  const judgementRank = {
    strong_provenance: 0,
    verified_with_disclosed_edits: 1,
    provisionally_signed: 2,
    limited_evidence: 3,
    inconsistent_or_suspicious: 4,
    tampered: 5,
    invalid_provenance: 6,
    invalid_or_tampered: 6, // legacy alias
    insufficient_evidence: 7,
  };

  items.sort((a, b) => {
    switch (sort) {
      case "name":
        return a.file.name.localeCompare(b.file.name);
      case "date":
        return b.timestamp - a.timestamp;
      case "size":
        return b.size - a.size;
      case "tier":
        return (
          (judgementRank[a.evalResult.finalTrustJudgement] ?? 9) -
          (judgementRank[b.evalResult.finalTrustJudgement] ?? 9)
        );
      default:
        return 0;
    }
  });

  if (items.length === 0) {
    $galleryGrid.innerHTML = `
      <div class="gallery-empty" style="grid-column: 1 / -1">
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="8" y="8" width="48" height="48" rx="4"/>
          <circle cx="24" cy="24" r="6"/>
          <path d="M8 48l16-16 8 8 12-12"/>
        </svg>
        <p>No images to display</p>
        <small>${filter !== "all" ? "Try a different filter" : "Upload a folder to get started"}</small>
      </div>`;
    return;
  }

  $galleryGrid.innerHTML = items
    .map(
      (item) => `
    <div class="gallery-item ${selectedItems.has(item.id) ? "selected" : ""}" data-id="${item.id}">
      <img class="gallery-item-img" src="${esc(item.dataURL)}" alt="${esc(item.file.name)}">
      <div class="gallery-item-emblem">${makeEmblemFromEval(item.evalResult, true)}</div>
      <div class="gallery-item-info">
        <div class="gallery-item-name" title="${esc(item.file.name)}">${esc(item.file.name)}</div>
        <div class="gallery-item-meta">
          <span>${(item.file.size / 1024).toFixed(1)} KB</span>
          <span>${getVerdictLabel(item.evalResult)}</span>
        </div>
        <div class="gallery-item-verdict ${item.category}">${VERDICT_LABELS[item.category] || item.category}</div>
      </div>
    </div>`,
    )
    .join("");

  $galleryGrid.querySelectorAll(".gallery-item").forEach((el) => {
    el.addEventListener("click", () => {
      const id = parseFloat(el.dataset.id);
      handleItemClick(id, items);
    });
  });
}

function getVerdictLabel(evalResult) {
  return (
    TRUST_LABELS[evalResult.finalTrustJudgement] ||
    evalResult.finalTrustJudgement
  );
}

function handleItemClick(id, items) {
  const item = items.find((i) => i.id === id);
  if (!item) return;

  if (selectedItems.has(id)) {
    selectedItems.delete(id);
    renderGallery();
    return;
  }

  if (selectedItems.size === 1) {
    const otherId = selectedItems.values().next().value;
    const otherItem = galleryItems.find((i) => i.id === otherId);
    if (otherItem) {
      openCompare(otherItem, item);
      selectedItems.clear();
      renderGallery();
      return;
    }
  }

  selectedItems.add(id);
  renderGallery();
}

function updateStats() {
  const stats = {
    total: galleryItems.length,
    verified: galleryItems.filter((i) => i.category === "verified").length,
    edited: galleryItems.filter((i) => i.category === "edited").length,
    ai: galleryItems.filter((i) => i.category === "ai").length,
    camera: galleryItems.filter((i) => i.category === "camera").length,
    unknown: galleryItems.filter((i) => i.category === "unknown").length,
  };

  document.getElementById("gsTotal").textContent = stats.total;
  document.getElementById("gsVerified").textContent = stats.verified;
  document.getElementById("gsEdited").textContent = stats.edited;
  document.getElementById("gsAi").textContent = stats.ai;
  document.getElementById("gsCamera").textContent = stats.camera;
  document.getElementById("gsUnknown").textContent = stats.unknown;
}

function clearGallery() {
  if (galleryItems.length === 0) return;
  if (!confirm("Clear all images from the gallery?")) return;

  galleryItems = [];
  selectedItems.clear();
  renderGallery();
  updateStats();
  $galleryStats.style.display = "none";
}

function openCompare(item1, item2) {
  document.getElementById("gcLeftImg").src = item1.dataURL;
  document.getElementById("gcLeftImg").alt = item1.file.name;
  document.getElementById("gcLeftEmblem").innerHTML = makeEmblemFromEval(
    item1.evalResult,
  );
  document.getElementById("gcLeftName").textContent = item1.file.name;
  document.getElementById("gcLeftVerdict").textContent = getItemVerdict(
    item1.evalResult,
  );

  document.getElementById("gcRightImg").src = item2.dataURL;
  document.getElementById("gcRightImg").alt = item2.file.name;
  document.getElementById("gcRightEmblem").innerHTML = makeEmblemFromEval(
    item2.evalResult,
  );
  document.getElementById("gcRightName").textContent = item2.file.name;
  document.getElementById("gcRightVerdict").textContent = getItemVerdict(
    item2.evalResult,
  );

  document.getElementById("gcDiff").innerHTML = generateDiff(item1, item2);
  $galleryCompare.style.display = "flex";
}

function getItemVerdict(evalResult) {
  const parts = [
    `Provenance: ${formatProvenanceStatus(evalResult.provenanceStatus)}`,
    `Content: ${formatContentEditStatus(evalResult.contentEditStatus)}`,
    `Trust: ${TRUST_LABELS[evalResult.finalTrustJudgement] || evalResult.finalTrustJudgement}`,
  ];
  return parts.join(" · ");
}

function closeCompare() {
  $galleryCompare.style.display = "none";
}

function generateDiff(item1, item2) {
  const diffs = [];
  const e1 = item1.evalResult;
  const e2 = item2.evalResult;

  if (e1.finalTrustJudgement !== e2.finalTrustJudgement) {
    diffs.push(
      `<strong>Trust judgement:</strong> ${TRUST_LABELS[e1.finalTrustJudgement]} vs ${TRUST_LABELS[e2.finalTrustJudgement]}`,
    );
  }
  if (e1.provenanceStatus !== e2.provenanceStatus) {
    diffs.push(
      `<strong>Provenance:</strong> ${formatProvenanceStatus(e1.provenanceStatus)} vs ${formatProvenanceStatus(e2.provenanceStatus)}`,
    );
  }
  if (e1.contentEditStatus !== e2.contentEditStatus) {
    diffs.push(
      `<strong>Content/edit:</strong> ${formatContentEditStatus(e1.contentEditStatus)} vs ${formatContentEditStatus(e2.contentEditStatus)}`,
    );
  }
  if (e1.metadataSupportStatus !== e2.metadataSupportStatus) {
    diffs.push(
      `<strong>Metadata support:</strong> ${formatMetadataSupportStatus(e1.metadataSupportStatus)} vs ${formatMetadataSupportStatus(e2.metadataSupportStatus)}`,
    );
  }

  const sizeDiff = Math.abs(item1.size - item2.size);
  const sizePercent = (
    (sizeDiff / Math.max(item1.size, item2.size)) *
    100
  ).toFixed(1);
  if (sizePercent > 10) {
    const larger = item1.size > item2.size ? item1 : item2;
    const smaller = item1.size > item2.size ? item2 : item1;
    diffs.push(
      `<strong>Size difference:</strong> ${larger.file.name} is ${sizePercent}% larger (${(larger.size / 1024).toFixed(1)} KB vs ${(smaller.size / 1024).toFixed(1)} KB)`,
    );
  }

  const date1 = new Date(item1.timestamp);
  const date2 = new Date(item2.timestamp);
  const daysDiff = Math.abs((date1 - date2) / (1000 * 60 * 60 * 24));
  if (daysDiff > 1) {
    diffs.push(
      `<strong>Date difference:</strong> ${date1.toLocaleDateString()} vs ${date2.toLocaleDateString()} (${Math.round(daysDiff)} days apart)`,
    );
  }

  if (diffs.length === 0) {
    return "<em>These images have similar provenance characteristics.</em>";
  }

  return diffs.map((d) => `<div>${d}</div>`).join("");
}

function formatProvenanceStatus(status) {
  switch (status) {
    case "c2pa_fully_verified":
      return "C2PA Verified";
    case "c2pa_signed_unverified_cert":
      return "C2PA Signed (Unverified Cert)";
    case "c2pa_tampered":
      return "C2PA Tampered";
    case "c2pa_invalid":
      return "C2PA Invalid";
    case "no_c2pa":
      return "No C2PA";
    // Legacy aliases
    case "c2pa_verified":
      return "C2PA Verified";
    case "c2pa_invalid_or_tampered":
      return "C2PA Invalid/Tampered";
    default:
      return "Unknown";
  }
}

function formatContentEditStatus(status) {
  switch (status) {
    case "original_or_camera_capture":
      return "Camera capture";
    case "disclosed_edits":
      return "Disclosed edits";
    case "ai_generated":
      return "AI/Synthetic";
    case "ai_generated_or_synthetic":
      return "AI/Synthetic"; // legacy alias
    case "suspected_undisclosed_editing":
      return "Suspected editing";
    default:
      return "Unknown";
  }
}

function formatMetadataSupportStatus(status) {
  switch (status) {
    case "metadata_supports_claim":
      return "Supports claim";
    case "metadata_inconsistent":
      return "Inconsistent";
    case "metadata_missing_or_stripped":
      return "Missing/stripped";
    case "metadata_not_useful":
      return "Not useful";
    default:
      return "Unknown";
  }
}

export { galleryItems, clearGallery };
