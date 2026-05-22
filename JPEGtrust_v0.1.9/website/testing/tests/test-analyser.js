// Tests for analyser.js — pure analysis pipeline
import { fileToDataURL, readExif, analyseFile } from '../../js/analyser.js';

// Mock dependencies
jest.mock('../../js/classifier.js', () => ({
  evaluateImage: () => ({
    provenanceStatus: 'no_c2pa',
    contentEditStatus: 'unknown',
    metadataSupportStatus: 'metadata_missing_or_stripped',
    finalTrustJudgement: 'insufficient_evidence',
    metadata: { hasC2pa: false }
  })
}));
jest.mock('../../js/scorer.js', () => ({
  computeScore: () => Promise.resolve({ evidence: [], signals: [] })
}));

describe('Analyser', () => {
  test('fileToDataURL converts file to data URL', async () => {
    const file = new File(['test'], 'test.png', { type: 'image/png' });
    global.FileReader = function() {
      this.readAsDataURL = () => this.onload({ target: { result: 'data:image/png;base64,test' } });
    };

    const result = await fileToDataURL(file);
    expect(result).toBe('data:image/png;base64,test');
  });

  test('readExif handles success case', async () => {
    const file = new File(['test'], 'test.jpg');
    const Exifr = { parse: jest.fn().mockResolvedValue({ Make: 'Canon' }) };

    const result = await readExif(file, Exifr);
    expect(result).toEqual({ Make: 'Canon' });
  });

  test('readExif handles error case', async () => {
    const file = new File(['test'], 'test.jpg');
    const Exifr = { parse: jest.fn().mockRejectedValue(new Error('Failed')) };

    const result = await readExif(file, Exifr);
    expect(result).toEqual({});
  });

  test('analyseFile performs full analysis with multi-dimensional evaluation', async () => {
    const file = new File(['test'], 'test.jpg');
    const sdk = { reader: { fromBlob: () => ({ manifestStore: () => {}, free: () => {} }) } };
    const Exifr = { parse: () => Promise.resolve({}) };

    const result = await analyseFile(file, sdk, Exifr);
    expect(result).toHaveProperty('file');
    expect(result).toHaveProperty('dataURL');
    // Multi-dimensional evaluation should be present
    expect(result).toHaveProperty('evalResult');
    expect(result.evalResult).toHaveProperty('provenanceStatus');
    expect(result.evalResult).toHaveProperty('contentEditStatus');
    expect(result.evalResult).toHaveProperty('metadataSupportStatus');
    expect(result.evalResult).toHaveProperty('finalTrustJudgement');
  });
});