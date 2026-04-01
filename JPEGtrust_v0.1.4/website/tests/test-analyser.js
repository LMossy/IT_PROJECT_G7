// Simple tests for analyser.js
import { fileToDataURL, readExif, analyseFile } from '../src/analyser.js';

// Mock dependencies
jest.mock('../src/classifier.js', () => ({ classifyImage: () => ({}) }));
jest.mock('../src/scorer.js', () => ({ computeScore: () => ({}) }));

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

  test('analyseFile performs full analysis', async () => {
    const file = new File(['test'], 'test.jpg');
    const sdk = { reader: { fromBlob: () => ({ manifestStore: () => {}, free: () => {} }) } };
    const Exifr = { parse: () => Promise.resolve({}) };
    
    const result = await analyseFile(file, sdk, Exifr);
    expect(result).toHaveProperty('file');
    expect(result).toHaveProperty('dataURL');
  });
});
