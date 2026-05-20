// Tests for analyser.js — pure analysis pipeline
import { fileToDataURL, readExif, analyseFile } from '../../js/analyser.js';

// Mock dependencies
jest.mock('../../js/classifier.js', () => ({ classifyImage: () => ({
  tier1: { classification: 'unverified', label: 'Unverified' },
  tier2: { indicator: 'unknown', label: 'Unknown' },
  tier3: { confidence: 'none', label: 'No provenance data' },
  tier: 3, verdict: 'unverified', verdictLabel: 'Unverified', colorClass: 'cgrey'
}) }));
jest.mock('../../js/scorer.js', () => ({ computeScore: () => ({ evidence: [], signals: [] }) }));

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

  test('analyseFile performs full analysis with three-tier cls', async () => {
    const file = new File(['test'], 'test.jpg');
    const sdk = { reader: { fromBlob: () => ({ manifestStore: () => {}, free: () => {} }) } };
    const Exifr = { parse: () => Promise.resolve({}) };

    const result = await analyseFile(file, sdk, Exifr);
    expect(result).toHaveProperty('file');
    expect(result).toHaveProperty('dataURL');
    // Three-tier classification should be present
    expect(result.cls).toHaveProperty('tier1');
    expect(result.cls).toHaveProperty('tier2');
    expect(result.cls).toHaveProperty('tier3');
    expect(result.cls.tier1).toHaveProperty('classification');
    expect(result.cls.tier1).toHaveProperty('label');
  });
});