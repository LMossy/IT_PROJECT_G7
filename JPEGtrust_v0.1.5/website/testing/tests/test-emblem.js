// Simple tests for emblem.js
import { makeEmblem } from '../../js/emblem.js';

describe('Emblem', () => {
  test('generates SVG for verified image', () => {
    const cls = { tier: 1, verdict: 'c2pa_verified' };
    const svg = makeEmblem(cls);
    expect(svg).toContain('<svg');
    expect(svg).toContain('M40,8 L66,20 L66,44');
  });

  test('generates SVG for EXIF image', () => {
    const cls = { tier: 2, verdict: 'exif_camera' };
    const svg = makeEmblem(cls);
    expect(svg).toContain('<svg');
    expect(svg).toContain('<rect');
  });

  test('generates SVG for no provenance', () => {
    const cls = { tier: 3, verdict: 'no_provenance' };
    const svg = makeEmblem(cls);
    expect(svg).toContain('<svg');
    expect(svg).toContain('?');
  });
});
