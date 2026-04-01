// Simple tests for scorer.js
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
  test('computes score for C2PA image', () => {
    const result = computeScore({ active: {} }, {}, { tier: 1, verdict: 'c2pa_manifest' });
    expect(result.evidence).toHaveLength(3);
    expect(result.signals.length).toBeGreaterThan(0);
  });

  test('computes score for EXIF image', () => {
    const result = computeScore(null, { Make: 'Canon' }, { tier: 2, verdict: 'exif_camera' });
    expect(result.evidence).toHaveLength(3);
  });

  test('computes score for no provenance', () => {
    const result = computeScore(null, {}, { tier: 3, verdict: 'no_provenance' });
    expect(result.evidence).toHaveLength(3);
  });
});
