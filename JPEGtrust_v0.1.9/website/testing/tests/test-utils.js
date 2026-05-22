// Tests for utils.js — pure utility functions
import { esc, delay, dr, safeJSON } from '../../js/utils.js';

describe('Utils', () => {
  test('esc escapes HTML', () => {
    expect(esc('<script>')).toBe('&lt;script&gt;');
    expect(esc('&')).toBe('&amp;');
    expect(esc('>')).toBe('&gt;');
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });

  test('delay creates promise', async () => {
    jest.useFakeTimers();
    const promise = delay(100);
    jest.advanceTimersByTime(100);
    await expect(promise).resolves.toBeUndefined();
    jest.useRealTimers();
  });

  test('dr creates data row', () => {
    expect(dr('Key', 'Value')).toContain('Key');
    expect(dr('Key', null)).toBe('');
    expect(dr('Key', '')).toBe('');
    expect(dr('Key', undefined)).toBe('');
    expect(dr('Key', 'Value', 'ok')).toContain('ok');
  });

  test('safeJSON clones objects', () => {
    const obj = { test: 'value' };
    expect(safeJSON(obj)).toEqual(obj);
  });

  test('safeJSON handles Uint8Array', () => {
    const obj = { data: new Uint8Array([1, 2, 3]) };
    const result = safeJSON(obj);
    expect(result.data).toBe('[binary]');
  });

  test('safeJSON handles circular reference gracefully', () => {
    const obj: any = { test: 'value' };
    obj.self = obj;
    expect(() => safeJSON(obj)).not.toThrow();
    expect(safeJSON(obj)).toEqual({});
  });
});