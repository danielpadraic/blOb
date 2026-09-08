import { describe, expect, it } from 'vitest';

import {
  HR_DISTANCE_STILL_CAP,
  slotAllowsMultipleStills,
  slotStillUris,
  withSlotStills,
} from '@/lib/checkin/slotStills';

describe('HR / distance stills', () => {
  it('caps extra tracker screens at 6', () => {
    expect(HR_DISTANCE_STILL_CAP).toBe(6);
  });

  it('dedupes uri + uris and skips health placeholders', () => {
    expect(
      slotStillUris({
        uri: 'file:///a.jpg',
        uris: ['file:///a.jpg', 'health:abc', 'file:///b.jpg'],
      }),
    ).toEqual(['file:///a.jpg', 'file:///b.jpg']);
  });

  it('allows extras on HR and distance, not selfies or vendor cards', () => {
    expect(slotAllowsMultipleStills({ method: 'hr' })).toBe(true);
    expect(slotAllowsMultipleStills({ method: 'distance' })).toBe(true);
    expect(slotAllowsMultipleStills({ method: 'photo' })).toBe(false);
    expect(slotAllowsMultipleStills({ method: 'hr' }, { healthWorkoutId: 'w1' })).toBe(false);
    expect(slotAllowsMultipleStills({ method: 'hr' }, { health: { source: 'healthkit' } })).toBe(false);
  });

  it('stores the first still as uri', () => {
    expect(withSlotStills({}, ['file:///a.jpg', 'file:///b.jpg'])).toEqual({
      uri: 'file:///a.jpg',
      uris: ['file:///a.jpg', 'file:///b.jpg'],
    });
  });
});
