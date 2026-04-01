// Simple tests for helpers.js
import * as h from '../../js/helpers.js';

describe('Helpers', () => {
  test('gets active manifest', () => {
    const mfst = { manifests: { a: 'active' }, active_manifest: 'a' };
    expect(h.getActiveManifest(mfst)).toBe('active');
  });

  test('gets validation results', () => {
    const mfst = { validation_results: { activeManifest: 'result' } };
    expect(h.getValidationResults(mfst)).toBe('result');
  });

  test('gets actions', () => {
    const m = { assertions: [{ label: 'c2pa.actions', data: { actions: ['test'] } }] };
    expect(h.getActions(m)).toEqual(['test']);
  });

  test('formats dates', () => {
    const result = h.fmtDate('2023-01-01');
    expect(result).toBeDefined();
  });
});
