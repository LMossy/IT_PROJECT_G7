// Tests for scorer.js — revised three-tier framework
import { computeScore } from '../../js/scorer.js';

jest.mock('../../js/helpers.js', () => ({
  getActiveManifest: () => ({}),
  getValidationResults: () => ({ success: [], failure: [] }),
  getValidationStatus: () => [],
  getActions: () => [],
  getAssertions: () => [],
  getDST: () => null,
  claimGen: () => null,
  getSigInfo: () => ({}),
  fmtDate: (s) => s
}));

describe('Scorer', () => {
  test('computes score for verified C2PA image', () => {
    // New-style classification object with three tiers
    const cls = {
      tier1: { classification: 'verified', label: 'Verified' },
      tier2: { indicator: 'unknown', label: 'Origin unknown' },
      tier3: { confidence: 'strong', label: 'Strong provenance' },
      colorClass: 'cteal'
    };
    const result = computeScore({ active: {} }, {}, cls);
    expect(result.evidence).toHaveLength(3);
    expect(result.signals.length).toBeGreaterThan(0);
    // Provenance row should be ok status for verified
    expect(result.evidence[0].status).toBe('ok');
  });

  test('computes score for edited C2PA image', () => {
    const cls = {
      tier1: { classification: 'edited', label: 'Edited' },
      tier2: { indicator: 'processed', label: 'Processed' },
      tier3: { confidence: 'partial', label: 'Partial provenance' },
      colorClass: 'camber'
    };
    const result = computeScore({ active: {} }, {}, cls);
    expect(result.evidence).toHaveLength(3);
  });

  test('computes score for AI-generated image', () => {
    const cls = {
      tier1: { classification: 'aiGenerated', label: 'AI Generated' },
      tier2: { indicator: 'synthetic', label: 'Synthetic' },
      tier3: { confidence: 'none', label: 'No provenance data' },
      colorClass: 'cpurp'
    };
    const result = computeScore({ active: {} }, {}, cls);
    expect(result.evidence).toHaveLength(3);
    // AI-generated provenance row should be purple
    expect(result.evidence[0].status).toBe('purple');
  });

  test('computes score for no provenance image', () => {
    const cls = {
      tier1: { classification: 'no_provenance', label: 'No Provenance' },
      tier2: { indicator: 'unknown', label: 'Unknown' },
      tier3: { confidence: 'none', label: 'No provenance data' },
      colorClass: 'cgrey'
    };
    const result = computeScore(null, {}, cls);
    expect(result.evidence).toHaveLength(3);
    // No provenance should have neutral signals
    expect(result.signals.every(s => s.status === 'neutral')).toBe(true);
  });

  test('computes score for EXIF camera image', () => {
    const cls = {
      tier1: { classification: 'unverified', label: 'Unverified' },
      tier2: { indicator: 'camera', label: 'Camera-originated' },
      tier3: { confidence: 'partial', label: 'Partial provenance' },
      colorClass: 'cblue'
    };
    const result = computeScore(null, { Make: 'Canon' }, cls);
    expect(result.evidence).toHaveLength(3);
  });
});