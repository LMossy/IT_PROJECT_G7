// Tests for evaluateImage function — multi-dimensional trust evaluation framework
import { evaluateImage } from '../../js/classifier.js';

// Mock all helpers to return specific values for testing
jest.mock('../../js/helpers.js', () => ({
  getActiveManifest: (mfst) => mfst?.active_manifest ? { id: 'test' } : null,
  getValidationResults: () => ({ success: [], failure: [] }),
  getValidationStatus: () => [],
  getActions: () => [],
  getAssertions: () => [],
  getDST: () => null
}));

describe('Multi-dimensional Trust Evaluation', () => {
  test('evaluates verified C2PA image', () => {
    const mfst = { active_manifest: 'test', manifests: { test: {} } };
    const result = evaluateImage(mfst, {}, {});

    // Provenance status: should be verified
    expect(result.provenanceStatus).toBe('c2pa_verified');
    // Content/edit status: should be original (no edits indicated)
    expect(result.contentEditStatus).toBe('original_or_camera_capture');
    // Metadata support: should support claim (no contradiction)
    expect(result.metadataSupportStatus).toBe('metadata_supports_claim');
    // Final trust judgement: should be strong_provenance
    expect(result.finalTrustJudgement).toBe('strong_provenance');
  });

  test('evaluates EXIF camera image (no C2PA)', () => {
    const exif = {
      Make: 'Canon',
      Model: 'EOS R5',
      DateTimeOriginal: '2023:01:01 12:00:00',
      Software: 'Camera Firmware', // Not matching EDIT_SW
      Artist: 'Test Photographer'
    };
    const result = evaluateImage(null, exif, {});

    // Provenance status: no C2PA
    expect(result.provenanceStatus).toBe('no_c2pa');
    // Content/edit status: should be original (has camera EXIF, no edit SW)
    expect(result.contentEditStatus).toBe('original_or_camera_capture');
    // Metadata support: not useful for provenance (EXIF alone)
    expect(result.metadataSupportStatus).toBe('metadata_not_useful');
    // Final trust judgement: limited evidence (has camera metadata)
    expect(result.finalTrustJudgement).toBe('limited_evidence');
  });

  test('evaluates no provenance image', () => {
    const result = evaluateImage(null, {}, {});

    // Provenance status: no C2PA
    expect(result.provenanceStatus).toBe('no_c2pa');
    // Content/edit status: unknown (no camera data)
    expect(result.contentEditStatus).toBe('unknown');
    // Metadata support: missing/stripped
    expect(result.metadataSupportStatus).toBe('metadata_missing_or_stripped');
    // Final trust judgement: insufficient evidence
    expect(result.finalTrustJudgement).toBe('insufficient_evidence');
  });

  test('evaluates AI-generated C2PA image', () => {
    const mfst = {
      active_manifest: 'a',
      manifests: {
        a: {
          assertions: [{
            label: 'c2pa.actions',
            data: { actions: [{ action: 'aiGenerated', digitalSourceType: 'https://cvpai.example.org/dst/trainedAlgorithmicMedia' }] }
          }]
        }
      }
    };
    const result = evaluateImage(mfst, {}, {});

    // Provenance status: verified (assuming valid signature)
    expect(result.provenanceStatus).toBe('c2pa_verified');
    // Content/edit status: AI-generated
    expect(result.contentEditStatus).toBe('ai_generated_or_synthetic');
    // Metadata support: should support claim
    expect(result.metadataSupportStatus).toBe('metadata_supports_claim');
    // Final trust judgement: verified with disclosed edits
    expect(result.finalTrustJudgement).toBe('verified_with_disclosed_edits');
  });

  test('evaluates edited C2PA image with content mismatch', () => {
    const mfst = {
      active_manifest: 'a',
      manifests: {
        a: {
          assertions: [{
            label: 'c2pa.actions',
            data: { actions: [{ action: 'edited' }] }
          }]
        }
      },
      validation_results: {
        activeManifest: {
          success: [],
          failure: [{ code: 'claimSignature.mismatch' }]
        }
      }
    };
    const result = evaluateImage(mfst, {}, {});

    // Provenance status: invalid/tampered (due to content mismatch)
    expect(result.provenanceStatus).toBe('c2pa_invalid_or_tampered');
    // Content/edit status: would depend on actions, but likely disclosed_edits
    // Metadata support: inconsistent (due to mismatch)
    expect(result.metadataSupportStatus).toBe('metadata_inconsistent');
    // Final trust judgement: invalid_or_tampered
    expect(result.finalTrustJudgement).toBe('invalid_or_tampered');
  });
});