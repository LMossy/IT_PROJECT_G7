// Tests for scorer.js — multi-dimensional framework
import { _computeScoreInternal } from '../../js/scorer.js';

// Mock dependencies
jest.mock('../../js/classifier.js', () => ({
  evaluateImage: () => ({
    provenanceStatus: 'c2pa_verified',
    contentEditStatus: 'original_or_camera_capture',
    metadataSupportStatus: 'metadata_supports_claim',
    finalTrustJudgement: 'strong_provenance',
    metadata: { hasC2pa: true, sigOK: true, certUntrusted: false, certRevoked: false, contentMismatch: false }
  })
}));

jest.mock('../../js/helpers.js', () => ({
  getActiveManifest: () => ({ id: 'test' }),
  getValidationResults: () => ({ success: [{ code: 'claimSignature.validated' }], failure: [] }),
  getValidationStatus: () => [],
  getActions: () => [],
  getAssertions: () => [],
  getDST: () => null,
  claimGen: () => 'Test Generator',
  getSigInfo: () => ({ issuer: 'Test CA', time: '2023-01-01T12:00:00Z' }),
  fmtDate: (s) => s
}));

describe('Scorer (Multi-dimensional)', () => {
  test('computes score for strong provenance image', async () => {
    // Mock file and SDK
    const file = new File([], 'test.jpg');
    const sdk = { reader: { fromBlob: async () => ({ manifestStore: async () => '{}', free: async () => {} }) } };
    const Exifr = { parse: async () => ({ Make: 'Canon' }) };

    const result = await _computeScoreInternal(file, sdk, Exifr);
    expect(result.evidence).toHaveLength(4);
    expect(result.signals.length).toBeGreaterThan(0);

    // Provenance row should be ok status for verified
    expect(result.evidence[0].label).toBe('Provenance source');
    expect(result.evidence[0].status).toBe('ok');

    // Content/edit row should be ok for original capture
    expect(result.evidence[1].label).toBe('Content assessment');
    expect(result.evidence[1].status).toBe('ok');

    // Metadata support row should be ok for supporting claim
    expect(result.evidence[2].label).toBe('Metadata consistency');
    expect(result.evidence[2].status).toBe('ok');

    // Trust judgement row should be ok for strong provenance
    expect(result.evidence[3].label).toBe('Trust assessment');
    expect(result.evidence[3].status).toBe('ok');
  });

  test('computes score for verified with disclosed edits image', async () => {
    // Mock evaluator to return disclosed edits
    jest.mock('../../js/classifier.js', () => ({
      evaluateImage: () => ({
        provenanceStatus: 'c2pa_verified',
        contentEditStatus: 'disclosed_edits',
        metadataSupportStatus: 'metadata_supports_claim',
        finalTrustJudgement: 'verified_with_disclosed_edits',
        metadata: { hasC2pa: true, sigOK: true, certUntrusted: false, certRevoked: false, contentMismatch: false }
      })
    }));

    const file = new File([], 'test.jpg');
    const sdk = { reader: { fromBlob: async () => ({ manifestStore: async () => '{}', free: async () => {} }) } };
    const Exifr = { parse: async () => ({}) };

    const result = await _computeScoreInternal(file, sdk, Exifr);
    expect(result.evidence).toHaveLength(4);

    // Trust judgement row should be ok for verified with disclosed edits
    expect(result.evidence[3].label).toBe('Trust assessment');
    expect(result.evidence[3].status).toBe('ok');
  });

  test('computes score for invalid/tampered C2PA image', async () => {
    // Mock evaluator to return invalid/tampered
    jest.mock('../../js/classifier.js', () => ({
      evaluateImage: () => ({
        provenanceStatus: 'c2pa_invalid_or_tampered',
        contentEditStatus: 'unknown',
        metadataSupportStatus: 'metadata_not_useful',
        finalTrustJudgement: 'invalid_or_tampered',
        metadata: { hasC2pa: true, sigOK: false, certUntrusted: false, certRevoked: true, contentMismatch: true }
      })
    }));

    const file = new File([], 'test.jpg');
    const sdk = { reader: { fromBlob: async () => ({ manifestStore: async () => '{}', free: async () => {} }) } };
    const Exifr = { parse: async () => ({}) };

    const result = await _computeScoreInternal(file, sdk, Exifr);
    expect(result.evidence).toHaveLength(4);

    // Provenance row should be bad status for invalid/tampered
    expect(result.evidence[0].label).toBe('Provenance source');
    expect(result.evidence[0].status).toBe('bad');

    // Trust judgement row should be bad for invalid/tampered
    expect(result.evidence[3].label).toBe('Trust assessment');
    expect(result.evidence[3].status).toBe('bad');
  });

  test('computes score for insufficient evidence image', async () => {
    // Mock evaluator to return insufficient evidence
    jest.mock('../../js/classifier.js', () => ({
      evaluateImage: () => ({
        provenanceStatus: 'no_c2pa',
        contentEditStatus: 'unknown',
        metadataSupportStatus: 'metadata_missing_or_stripped',
        finalTrustJudgement: 'insufficient_evidence',
        metadata: { hasC2pa: false }
      })
    }));

    const file = new File([], 'test.jpg');
    const sdk = { reader: { fromBlob: async () => ({ manifestStore: async () => '{}', free: async () => {} }) } };
    const Exifr = { parse: async () => ({}) };

    const result = await _computeScoreInternal(file, sdk, Exifr);
    expect(result.evidence).toHaveLength(4);

    // Trust judgement row should be neutral for insufficient evidence
    expect(result.evidence[3].label).toBe('Trust assessment');
    expect(result.evidence[3].status).toBe('neutral');
  });
});