import { describe, expect, it } from 'vitest';

import {
  allMetricsHit,
  applyMetricName,
  formatMetricProgress,
  isDistanceMetricName,
  resolveCumulativeMetrics,
} from '@/lib/cumulativeMetrics';

describe('Simple Cumulative metrics', () => {
  it('formats GOAL as 0 / 128 mi before logs', () => {
    expect(
      formatMetricProgress(0, { target: 128, name: 'miles', unit: 'mi' }),
    ).toBe('0 / 128 mi');
  });

  it('shows Mi/Km chips only for distance names', () => {
    expect(isDistanceMetricName('miles')).toBe(true);
    expect(isDistanceMetricName('km')).toBe(true);
    expect(isDistanceMetricName('push-ups')).toBe(false);
    expect(applyMetricName({ id: 'm1', target: 10, name: '' }, 'push-ups').unit).toBeNull();
  });

  it('requires every metric before completed_at', () => {
    const metrics = [
      { id: 'a', target: 3000, name: 'push-ups' },
      { id: 'b', target: 1000, name: 'pull-ups' },
    ];
    expect(allMetricsHit(metrics, { a: 3000, b: 999 })).toBe(false);
    expect(allMetricsHit(metrics, { a: 3000, b: 1000 })).toBe(true);
  });

  it('reads a published metrics[] row as the Overview target', () => {
    const rows = resolveCumulativeMetrics({
      challenge_type: 'cumulative',
      format: 'cumulative',
      metrics: [{ id: 'm1', target: 128, name: 'miles', unit: 'mi' }],
    });
    expect(rows[0]).toMatchObject({ target: 128, name: 'miles', unit: 'mi' });
  });
});
