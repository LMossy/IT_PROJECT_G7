// ─────────────────────────────────────────────────────────────
// helpers.js — C2PA manifest accessor functions
//
// The c2pa-web SDK returns snake_case keys that mirror the Rust
// structs from c2pa-rs.  All property access goes through these
// helpers so the rest of the codebase never hard-codes field names.
// ─────────────────────────────────────────────────────────────

/**
 * Resolve the active manifest object from a manifest store.
 * SDK shape:  mfst.manifests[mfst.active_manifest]
 * Fallback:   mfst.activeManifest  (camelCase — older SDK versions)
 */
export const getActiveManifest = mfst =>
  mfst?.manifests?.[mfst.active_manifest] ?? mfst?.activeManifest ?? null;

/**
 * Top-level validation_status array (policy-level failures, e.g. signingCredential.untrusted).
 * NOT the same as validation_results — see getValidationResults().
 */
export const getValidationStatus = mfst =>
  mfst?.validation_status ?? mfst?.validationStatus ?? [];

/**
 * Detailed validation results for the active manifest.
 * Contains success[], failure[], and informational[] arrays with per-check codes.
 */
export const getValidationResults = mfst =>
  mfst?.validation_results?.activeManifest ?? mfst?.validationResults?.activeManifest ?? null;

/** All assertions on a manifest object */
export const getAssertions = m => m?.assertions ?? [];

/**
 * Actions array from the c2pa.actions or c2pa.actions.v2 assertion.
 * Both label variants are matched — the spec moved to .v2 in 2024.
 */
export const getActions = m => {
  const a = getAssertions(m).find(
    x => x.label === 'c2pa.actions' || x.label === 'c2pa.actions.v2'
  );
  return a?.data?.actions ?? [];
};

/**
 * Digital Source Type URI for a manifest.
 * Priority: action-level digitalSourceType → assertion-level digitalSourceType.
 * Returns the full URI string or null.
 */
export const getDST = m => {
  for (const a of getActions(m)) {
    if (a.digitalSourceType) return a.digitalSourceType;
  }
  const cw = getAssertions(m).find(x => x.data?.digitalSourceType);
  return cw?.data?.digitalSourceType ?? null;
};

/**
 * Claim generator name.
 * SDK returns claim_generator_info[].name (snake_case).
 */
export const claimGen = m =>
  m?.claim_generator_info?.[0]?.name
    ?? m?.claimGeneratorInfo?.[0]?.name
    ?? m?.claimGenerator
    ?? null;

/**
 * Signature info object (issuer, common_name, alg, time, cert_serial_number).
 * SDK returns signature_info (snake_case).
 */
export const getSigInfo = m => m?.signature_info ?? m?.signatureInfo ?? {};

/** Format a date string or Date for display, returns null on falsy input */
export const fmtDate = s => {
  if (!s) return null;
  try { return new Date(s).toLocaleString(); } catch { return String(s); }
};
