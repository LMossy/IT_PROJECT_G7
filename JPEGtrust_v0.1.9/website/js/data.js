// ─────────────────────────────────────────────────────────────
// data.js — reference data for trust evaluation
//
// Defines action types, editing software, validation status
// codes, and digital source types used across the scoring,
// classification, and rendering pipelines.
// ─────────────────────────────────────────────────────────────

/** Digital Source Type (DST) registry — maps URI tails to labels and AI flags */
export const DST = {
  trainedAlgorithmicMedia: {
    label: "AI-generated (trained model)",
    ai: true,
  },
  digitalCapture: {
    label: "Digital Capture",
    ai: false,
  },
  aiGenerated: {
    label: "AI-generated",
    ai: true,
  },
  photograph: {
    label: "Photograph",
    ai: false,
  },
  screenshot: {
    label: "Screenshot",
    ai: false,
  },
  graphicArt: {
    label: "Graphic Art / Illustration",
    ai: false,
  },
  vectorArt: {
    label: "Vector Art",
    ai: false,
  },
  text: {
    label: "Text Document",
    ai: false,
  },
  videoFrame: {
    label: "Video Frame",
    ai: false,
  },
  threeDRender: {
    label: "3D Render",
    ai: false,
  },
  panorama: {
    label: "Panorama",
    ai: false,
  },
  composite: {
    label: "Composite Image",
    ai: false,
  },
};

/**
 * Action types recognised in C2PA manifests.
 * Each action has a human-readable label and a risk level:
 *   none    — benign / informational
 *   low     — minor adjustment (cropping, rotation, colour correction)
 *   moderate — noticeable but common (filters, resizing, format conversion)
 *   high    — significant alteration (compositing, removal, retouching)
 *   critical — synthetic generation or major manipulation
 */
export const ACTIONS = {
  created: { label: "Created", risk: "none" },
  edited: { label: "Edited", risk: "moderate" },
  cropped: { label: "Cropped", risk: "low" },
  rotated: { label: "Rotated", risk: "none" },
  colourAdjusted: { label: "Colour Adjusted", risk: "low" },
  whiteBalanced: { label: "White Balanced", risk: "low" },
  exposed: { label: "Exposure Adjusted", risk: "low" },
  contrastAdjusted: { label: "Contrast Adjusted", risk: "low" },
  sharpened: { label: "Sharpened", risk: "low" },
  resized: { label: "Resized", risk: "low" },
  filtered: { label: "Filtered", risk: "moderate" },
  retouched: { label: "Retouched", risk: "high" },
  composite: { label: "Composited", risk: "high" },
  textAdded: { label: "Text Added", risk: "moderate" },
  watermarkAdded: { label: "Watermark Added", risk: "low" },
  metadataStripped: { label: "Metadata Stripped", risk: "moderate" },
  noiseAdded: { label: "Noise Added", risk: "low" },
  bgRemoved: { label: "Background Removed", risk: "high" },
  faceRetouched: { label: "Face Retouched", risk: "high" },
  aiGenerated: { label: "AI-generated", risk: "critical" },
  aiEdited: { label: "AI-edited", risk: "critical" },
  styleTransfer: { label: "Style Transfer Applied", risk: "high" },
  upscaled: { label: "Upscaled", risk: "low" },
  formatConverted: { label: "Format Converted", risk: "none" },
};

/** Validation status codes and their human-readable labels */
export const VSTATUS = {
  "claimSignature.validated": { label: "Signature validated" },
  "claimSignature.mismatch": { label: "Signature mismatch" },
  "assertion.hashedURI.mismatch": { label: "Manifest URI mismatch" },
  "assertion.dataHash.mismatch": { label: "Data hash mismatch" },
  "signingCredential.untrusted": { label: "Certificate not in trust store" },
  "signingCredential.revoked": { label: "Certificate revoked" },
  "signingCredential.expired": { label: "Certificate expired" },
  "assertion.thumbnail.mismatch": { label: "Thumbnail mismatch" },
  c2pHashMismatch: { label: "Content hash mismatch" },
};

/** Known editing software strings (case-insensitive substring match) */
export const EDIT_SW = [
  "photoshop",
  "gimp",
  "adobe",
  "lightroom",
  "canva",
  "fotor",
  "pixlr",
  "snapseed",
  "vsco",
  "afterlight",
  "affinity",
  "sketch",
  "figma",
  "illustrator",
  "corel",
  "paint.net",
  "krita",
  "clip",
  "capture one",
  "darktable",
  "rawtherapee",
];

/**
 * Known AI image generator names — matched against all text metadata fields.
 * Lowercase; compared with field.toLowerCase().includes(name).
 */
export const AI_GENERATORS = [
  // OpenAI
  "dall-e",
  "dalle",
  "sora",
  "openai",
  "chatgpt",
  "gpt-4",
  "gpt4",
  // Midjourney
  "midjourney",
  "midjrny",
  // Stability AI
  "stable diffusion",
  "stability ai",
  "dreamstudio",
  "sdxl",
  "sd 1.",
  "sd 2.",
  // Automatic1111 / ComfyUI
  "automatic1111",
  "a1111",
  "comfyui",
  "invoke ai",
  "invokeai",
  // Adobe
  "adobe firefly",
  "firefly",
  // Google
  "imagen",
  "gemini",
  "google ai",
  // Microsoft
  "bing image creator",
  "microsoft designer",
  "copilot",
  // Meta
  "meta ai",
  // Other popular tools
  "ideogram",
  "leonardo ai",
  "leonardo.ai",
  "runway",
  "pika",
  "nightcafe",
  "novelai",
  "dreamboothml",
  "heygen",
  "kaiber",
  "canva ai",
  "canva text to image",
  // FLUX
  "flux.1",
  "black forest labs",
  // Catch-all phrases
  "ai generated",
  "ai-generated",
  "generated by ai",
  "text-to-image",
  "text to image",
  "diffusion model",
  "generative ai",
];

/** Image modification severity categories */
export const MOD_LEVELS = {
  NONE: { label: "Unmodified", class: "cteal" },
  MINOR: { label: "Minor Edit", class: "cblue" },
  MODERATE: { label: "Moderate Edit", class: "camber" },
  SIGNIFICANT: { label: "Significant Edit", class: "cred" },
};
