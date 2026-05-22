// Tests for emblem.js — multi-dimensional framework
import { makeEmblemFromEval } from '../../js/emblem.js';

describe('Emblem (Multi-dimensional)', () => {
  test('generates SVG for strong provenance image', () => {
    const evalResult = {
      finalTrustJudgement: 'strong_provenance'
    };
    const svg = makeEmblemFromEval(evalResult);
    expect(svg).toContain('<svg');
    expect(svg).toContain('shield'); // Shield path
    expect(svg).toContain('M28 40l9 9 15-18'); // Checkmark icon
  });

  test('generates SVG for verified with disclosed edits image', () => {
    const evalResult = {
      finalTrustJudgement: 'verified_with_disclosed_edits'
    };
    const svg = makeEmblemFromEval(evalResult);
    expect(svg).toContain('<svg');
    expect(svg).toContain('shield'); // Shield path
  });

  test('generates SVG for limited evidence image', () => {
    const evalResult = {
      finalTrustJudgement: 'limited_evidence'
    };
    const svg = makeEmblemFromEval(evalResult);
    expect(svg).toContain('<svg');
    expect(svg).toContain('circle'); // Circle emblem
    expect(svg).toContain('>i<'); // Info icon
  });

  test('generates SVG for insufficient evidence image', () => {
    const evalResult = {
      finalTrustJudgement: 'insufficient_evidence'
    };
    const svg = makeEmblemFromEval(evalResult);
    expect(svg).toContain('<svg');
    expect(svg).toContain('circle'); // Circle emblem
    expect(svg).toContain('>?<'); // Question mark icon
  });

  test('generates SVG for invalid or tampered image', () => {
    const evalResult = {
      finalTrustJudgement: 'invalid_or_tampered'
    };
    const svg = makeEmblemFromEval(evalResult);
    expect(svg).toContain('<svg');
    expect(svg).toContain('shield'); // Shield path
    expect(svg).toContain('M30 30l10 10M30 50l10-10'); // X icon
  });

  test('generates small SVG for thumbnail overlays', () => {
    const evalResult = {
      finalTrustJudgement: 'strong_provenance'
    };
    const svg = makeEmblemFromEval(evalResult, true);
    expect(svg).toContain('width="36"');
    expect(svg).toContain('height="36"');
  });
});

// Backward compatibility test for old makeEmblem function
import { makeEmblem } from '../../js/emblem.js';

describe('Emblem (Backward Compatibility)', () => {
  test('still works with old three-tier format', () => {
    const cls = {
      tier1: { classification: 'verified', label: 'Verified' },
      colorClass: 'cteal'
    };
    const svg = makeEmblem(cls);
    expect(svg).toContain('<svg');
    expect(svg).toContain('shield');
  });
});