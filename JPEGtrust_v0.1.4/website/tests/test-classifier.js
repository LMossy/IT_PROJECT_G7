// Simple tests for classifier.js
import { classifyImage } from '../src/classifier.js';

// Mock all helpers to return specific values for testing
jest.mock('../src/helpers.js', () => ({
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
    expect(result.tier).toBe(1);
  });

  test('classifies EXIF camera image', () => {
    // Create EXIF data that passes all conditions
    const exif = { 
      Make: 'Canon', 
      Model: 'EOS R5',
      DateTimeOriginal: '2023:01:01 12:00:00',
      Software: 'Camera Firmware', // Not matching EDIT_SW
      Artist: 'Test Photographer'
    };
    const result = classifyImage(null, exif, {});
    expect(result.tier).toBe(2);
    expect(result.verdict).toBe('exif_camera');
  });

  test('classifies no provenance image', () => {
    const result = classifyImage(null, {}, {});
    expect(result.tier).toBe(3);
    expect(result.verdict).toBe('no_provenance');
  });
});
