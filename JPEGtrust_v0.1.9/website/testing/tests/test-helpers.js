// Tests for helpers.js — C2PA manifest accessor functions
import * as h from '../../js/helpers.js';

describe('Helpers', () => {
  test('gets active manifest', () => {
    const mfst = { manifests: { a: 'active' }, active_manifest: 'a' };
    expect(h.getActiveManifest(mfst)).toBe('active');
  });

  test('gets active manifest (camelCase fallback)', () => {
    const mfst = { activeManifest: 'active' };
    expect(h.getActiveManifest(mfst)).toBe('active');
  });

  test('gets active manifest returns null when missing', () => {
    expect(h.getActiveManifest(null)).toBe(null);
    expect(h.getActiveManifest({})).toBe(null);
  });

  test('gets validation results', () => {
    const mfst = { validation_results: { activeManifest: 'result' } };
    expect(h.getValidationResults(mfst)).toBe('result');
  });

  test('gets validation results (snake_case fallback)', () => {
    const mfst = { validation_results: { activeManifest: 'result' } };
    expect(h.getValidationResults(mfst)).toBe('result');
  });

  test('gets validation status', () => {
    const mfst = { validation_status: [{ code: 'test' }] };
    expect(h.getValidationStatus(mfst)).toEqual([{ code: 'test' }]);
  });

  test('gets actions', () => {
    const m = { assertions: [{ label: 'c2pa.actions', data: { actions: ['test'] } }] };
    expect(h.getActions(m)).toEqual(['test']);
  });

  test('gets actions (v2 variant)', () => {
    const m = { assertions: [{ label: 'c2pa.actions.v2', data: { actions: ['test'] } }] };
    expect(h.getActions(m)).toEqual(['test']);
  });

  test('returns empty array when no actions found', () => {
    expect(h.getActions({})).toEqual([]);
    expect(h.getActions(null)).toEqual([]);
  });

  test('gets assertions', () => {
    const m = { assertions: [{ label: 'test', data: {} }] };
    expect(h.getAssertions(m)).toEqual([{ label: 'test', data: {} }]);
  });

  test('gets DST from action', () => {
    const m = {
      assertions: [{
        label: 'c2pa.actions',
        data: { actions: [{ action: 'created', digitalSourceType: 'https://cvpai.example.org/dst/photograph' }] }
      }]
    };
    expect(h.getDST(m)).toBe('https://cvpai.example.org/dst/photograph');
  });

  test('gets DST from assertion data', () => {
    const m = {
      assertions: [{
        label: 'c2pa.digital_source_type',
        data: { digitalSourceType: 'https://cvpai.example.org/dst/photograph' }
      }]
    };
    expect(h.getDST(m)).toBe('https://cvpai.example.org/dst/photograph');
  });

  test('returns null when no DST', () => {
    expect(h.getDST({})).toBe(null);
    expect(h.getDST(null)).toBe(null);
  });

  test('gets claim generator', () => {
    const m = { claim_generator_info: [{ name: 'Adobe Photoshop' }] };
    expect(h.claimGen(m)).toBe('Adobe Photoshop');
  });

  test('gets claim generator (camelCase fallback)', () => {
    const m = { claimGeneratorInfo: [{ name: 'GIMP' }] };
    expect(h.claimGen(m)).toBe('GIMP');
  });

  test('gets claim generator (legacy fallback)', () => {
    const m = { claimGenerator: 'test tool' };
    expect(h.claimGen(m)).toBe('test tool');
  });

  test('returns null when no claim generator', () => {
    expect(h.claimGen({})).toBe(null);
    expect(h.claimGen(null)).toBe(null);
  });

  test('gets signature info', () => {
    const m = { signature_info: { issuer: 'Test CA', time: '2024-01-01' } };
    expect(h.getSigInfo(m)).toEqual({ issuer: 'Test CA', time: '2024-01-01' });
  });

  test('gets signature info (camelCase fallback)', () => {
    const m = { signatureInfo: { issuer: 'Test CA' } };
    expect(h.getSigInfo(m)).toEqual({ issuer: 'Test CA' });
  });

  test('returns empty object when no sig info', () => {
    expect(h.getSigInfo({})).toEqual({});
    expect(h.getSigInfo(null)).toEqual({});
  });

  test('formats dates', () => {
    expect(h.fmtDate('2023-01-01')).toBeDefined();
    expect(h.fmtDate(null)).toBe(null);
    expect(h.fmtDate('')).toBe(null);
    expect(h.fmtDate(undefined)).toBe(null);
  });
});