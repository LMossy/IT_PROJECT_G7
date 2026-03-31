// Simple tests for renderer.js
import { buildReasonBullets, renderReport } from '../src/renderer.js';

jest.mock('../src/emblem.js', () => ({ makeEmblem: () => '<svg></svg>' }));

describe('Renderer', () => {
  test('builds reason bullets', () => {
    const bullets = buildReasonBullets({}, {}, { tier: 3 }, {});
    expect(bullets.length).toBeGreaterThan(0);
  });

  test('renders report', () => {
    document.body.innerHTML = '<div id="report"></div>';
    const file = new File([], 'test.jpg');
    
    renderReport(file, '', {}, {}, { verdict: 'test' }, {}, () => {});
    
    const report = document.getElementById('report');
    expect(report.classList.contains('on')).toBe(true);
  });
});
