import { describe, test, expect } from 'vitest';
import { severityPillClass, severityHex } from '../../utils/severity';

/**
 * Regression test for #59: RescanRequestCard and ToolDetailViewPage each had
 * their own local severity-color mapping, and both used blue for "low" while
 * the shared chart palette (SEVERITY_HEX) uses green — the same severity read
 * as two different colors depending on which screen you were on.
 */
describe('severityPillClass matches the chart color family', () => {
  test('low is green, matching SEVERITY_HEX.low, not blue', () => {
    expect(severityPillClass('low')).toContain('green');
    expect(severityPillClass('low')).not.toContain('blue');
    expect(severityHex('low')).toBe('#16a34a'); // green-600
  });

  test('is case-insensitive', () => {
    expect(severityPillClass('Low')).toBe(severityPillClass('low'));
    expect(severityPillClass('CRITICAL')).toBe(severityPillClass('critical'));
  });

  test('unknown severity falls back to neutral gray', () => {
    expect(severityPillClass('unknown')).toContain('slate');
    expect(severityPillClass(null)).toContain('slate');
  });
});
