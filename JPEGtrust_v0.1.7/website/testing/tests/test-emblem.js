// Tests for emblem.js — revised three-tier framework
import { makeEmblem } from '../../js/emblem.js';

describe('Emblem', () => {
  test('generates SVG for verified image', () => {
    const cls = {
      tier1: { classification: 'verified', label: 'Verified' },
      colorClass: 'cteal'
    };
    const svg = makeEmblem(cls);
    expect(svg).toContain('<svg');
    expect(svg).toContain('M40,8 L66,20 L66,44');
  });

  test('generates SVG for edited image', () => {
    const cls = {
      tier1: { classification: 'edited', label: 'Edited' },
      colorClass: 'camber'
    };
    const svg = makeEmblem(cls);
    expect(svg).toContain('<svg');
    expect(svg).toContain('SHIELD_PATH' || '<path');
  });

  test('generates SVG for AI-generated image', () => {
    const cls = {
      tier1: { classification: 'aiGenerated', label: 'AI Generated' },
      colorClass: 'cpurp'
    };
    const svg = makeEmblem(cls);
    expect(svg).toContain('<svg');
    expect(svg).toContain('>AI<');
  });

  test('generates SVG for camera-originated image (tier 2)', () => {
    const cls = {
      tier1: { classification: 'unverified', label: 'Unverified' },
      tier2: { indicator: 'camera', label: 'Camera-originated' },
      colorClass: 'cblue'
    };
    const svg = makeEmblem(cls);
    expect(svg).toContain('<svg');
    expect(svg).toContain('<rect');
  });

  test('generates SVG for no provenance image', () => {
    const cls = {
      tier1: { classification: 'no_provenance', label: 'No Provenance' },
      colorClass: 'cgrey'
    };
    const svg = makeEmblem(cls);
    expect(svg).toContain('<svg');
    expect(svg).toContain('?');
  });

  test('generates small SVG for thumbnail overlays', () => {
    const cls = {
      tier1: { classification: 'verified', label: 'Verified' },
      colorClass: 'cteal'
    };
    const svg = makeEmblem(cls, true);
    expect(svg).toContain('width="36"');
    expect(svg).toContain('height="36"');
  });
});