// Tests for renderer.js — revised three-tier framework
import { buildReasonBullets, renderReport } from '../../js/renderer.js';

jest.mock('../../js/emblem.js', () => ({ makeEmblem: () => '<svg></svg>' }));

describe('Renderer', () => {
  test('builds reason bullets for verified image', () => {
    const cls = {
      tier1: { classification: 'verified', label: 'Verified' },
      tier2: { indicator: 'unknown', label: 'Unknown' },
      tier3: { confidence: 'strong', label: 'Strong provenance' },
      colorClass: 'cteal',
      verdict: 'verified',
      verdictLabel: 'Verified'
    };
    const bullets = buildReasonBullets({ active: {} }, {}, cls, {});
    expect(bullets.length).toBeGreaterThan(0);
    // Verified should have at least one ok bullet
    expect(bullets.some(b => b.type === 'ok')).toBe(true);
  });

  test('builds reason bullets for no provenance image', () => {
    const cls = {
      tier1: { classification: 'no_provenance', label: 'No Provenance' },
      tier2: { indicator: 'unknown', label: 'Unknown' },
      tier3: { confidence: 'none', label: 'No provenance data' },
      colorClass: 'cgrey',
      verdict: 'no_provenance',
      verdictLabel: 'No Provenance'
    };
    const bullets = buildReasonBullets(null, {}, cls, {});
    expect(bullets.length).toBeGreaterThan(0);
    // No provenance bullets should be neutral
    expect(bullets.every(b => b.type === 'neutral')).toBe(true);
  });

  test('builds reason bullets for AI-generated image', () => {
    const cls = {
      tier1: { classification: 'aiGenerated', label: 'AI Generated' },
      tier2: { indicator: 'synthetic', label: 'Synthetic' },
      tier3: { confidence: 'none', label: 'No provenance data' },
      colorClass: 'cpurp',
      verdict: 'aiGenerated',
      verdictLabel: 'AI Generated'
    };
    const bullets = buildReasonBullets({ active: {} }, {}, cls, {});
    expect(bullets.length).toBeGreaterThan(0);
    // AI-generated should have at least one purple or info bullet
    const hasPurpleOrInfo = bullets.some(b => b.type === 'purple' || b.type === 'info');
    expect(hasPurpleOrInfo).toBe(true);
  });

  test('renders report with three-tier data', () => {
    document.body.innerHTML = '<div id="report"></div>';
    const file = new File([], 'test.jpg');

    const cls = {
      tier1: { classification: 'verified', label: 'Verified' },
      tier2: { indicator: 'unknown', label: 'Unknown' },
      tier3: { confidence: 'strong', label: 'Strong provenance' },
      colorClass: 'cteal',
      verdict: 'verified',
      verdictLabel: 'Verified'
    };
    const sr = {
      evidence: [
        { label: 'Provenance source', value: 'C2PA manifest', status: 'ok' },
        { label: 'Signature integrity', value: 'Valid', status: 'ok' },
        { label: 'Modification assessment', value: 'Minimal changes', status: 'ok' }
      ],
      signals: [{ text: 'C2PA manifest found', status: 'ok' }]
    };

    renderReport(file, '', {}, {}, cls, sr, () => {});

    const report = document.getElementById('report');
    expect(report.classList.contains('on')).toBe(true);
    // Should contain tier summary
    expect(report.innerHTML).toContain('Tier 1');
    expect(report.innerHTML).toContain('Tier 2');
    expect(report.innerHTML).toContain('Tier 3');
  });
});