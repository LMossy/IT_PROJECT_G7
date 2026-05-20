// Tests for classifier.js — revised three-tier framework
import { classifyImage } from '../../js/classifier.js';

// Mock all helpers to return specific values for testing
jest.mock('../../js/helpers.js', () => ({
  getActiveManifest: (mfst) => mfst?.active_manifest ? { id: 'test' } : null,
  getValidationResults: () => ({ success: [], failure: [] }),
  getValidationStatus: () => [],
  getActions: () => [],
  getAssertions: () => [],
  getDST: () => null
}));

describe('Classifier', () => {
  test('classifies verified C2PA image', () => {
    const mfst = { active_manifest: 'test', manifests: { test: {} } };
    const result = classifyImage(mfst, {}, {});
    // Tier 1: verified (has C2PA, no edits, sig OK)
    expect(result.tier1.classification).toBe('verified');
    expect(result.tier1.label).toBe('Verified');
    // Tier 2: unknown (no EXIF)
    expect(result.tier2.indicator).toBe('unknown');
    // Tier 3: strong (has C2PA with valid sig)
    expect(result.tier3.confidence).toBe('strong');
    // Backward compat
    expect(result.tier).toBe(1);
  });

  test('classifies EXIF camera image', () => {
    const exif = {
      Make: 'Canon',
      Model: 'EOS R5',
      DateTimeOriginal: '2023:01:01 12:00:00',
      Software: 'Camera Firmware', // Not matching EDIT_SW
      Artist: 'Test Photographer'
    };
    const result = classifyImage(null, exif, {});
    // Tier 1: unverified (no C2PA, has EXIF camera)
    expect(result.tier1.classification).toBe('unverified');
    expect(result.tier1.label).toBe('Unverified');
    // Tier 2: camera
    expect(result.tier2.indicator).toBe('camera');
    expect(result.tier2.label).toBe('Camera-originated');
    // Tier 3: partial (has EXIF with timestamp)
    expect(result.tier3.confidence).toBe('partial');
    expect(result.tier3.label).toBe('Partial provenance');
    // Backward compat
    expect(result.tier).toBe(2);
    expect(result.verdict).toBe('unverified');
  });

  test('classifies no provenance image', () => {
    const result = classifyImage(null, {}, {});
    // Tier 1: no_provenance
    expect(result.tier1.classification).toBe('no_provenance');
    expect(result.tier1.label).toBe('No Provenance');
    // Tier 2: unknown
    expect(result.tier2.indicator).toBe('unknown');
    // Tier 3: none
    expect(result.tier3.confidence).toBe('none');
    expect(result.tier3.label).toBe('No provenance data');
    // Backward compat
    expect(result.tier).toBe(3);
    expect(result.verdict).toBe('no_provenance');
  });

  test('classifies AI-generated C2PA image', () => {
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
    const result = classifyImage(mfst, {}, {});
    expect(result.tier1.classification).toBe('aiGenerated');
    expect(result.tier1.label).toBe('AI Generated');
    expect(result.tier2.indicator).toBe('synthetic');
  });

  test('classifies edited C2PA image with content mismatch', () => {
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
    const result = classifyImage(mfst, {}, {});
    expect(result.tier1.classification).toBe('edited');
    expect(result.tier1.label).toBe('Edited');
  });
});