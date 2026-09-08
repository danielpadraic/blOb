import { describe, expect, it } from 'vitest';

import { unionOcrFields } from '@/lib/health/ocrUnion';

describe('unionOcrFields', () => {
  it('keeps the first confident value and does not average', () => {
    const union = unionOcrFields([
      { fields: { durationSec: 2100, avgHrBpm: 98 } },
      { fields: { durationSec: 1800, activeEnergyKcal: 218, distanceMeters: 2237 } },
    ]);
    expect(union.fields).toEqual({
      durationSec: 2100,
      avgHrBpm: 98,
      activeEnergyKcal: 218,
      distanceMeters: 2237,
    });
  });

  it('does not overwrite with a later miss', () => {
    const union = unionOcrFields([
      { fields: { avgHrBpm: 142 }, clockRange: { start: { hour: 7, minute: 0 }, end: { hour: 8, minute: 0 } } },
      { fields: { avgHrBpm: 90 }, activityLabel: 'Outdoor Walk' },
    ]);
    expect(union.fields.avgHrBpm).toBe(142);
    expect(union.clockRange?.start.hour).toBe(7);
    expect(union.activityLabel).toBe('Outdoor Walk');
  });
});
