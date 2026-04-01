// Simple tests for utils.js
import { esc, delay, dr, safeJSON } from '../../js/utils.js';

describe('Utils', () => {
  test('esc escapes HTML', () => {
    expect(esc('<script>')).toBe('&lt;script&gt;');
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
  });

  test('safeJSON clones objects', () => {
    const obj = { test: 'value' };
    expect(safeJSON(obj)).toEqual(obj);
  });
});
