import { describe, expect, it } from 'vitest';

import {
  officialPairLiveFailure,
  officialPairLiveMiss,
  officialPairSiblingRoom,
} from '@/lib/officialPairLive';

describe('official pair live', () => {
  it('names the room that did not get the Live post', () => {
    expect(officialPairSiblingRoom('coin_weekly')).toBe('Monthly');
    expect(officialPairSiblingRoom('coin_monthly')).toBe('Weekly');
    expect(officialPairSiblingRoom(null)).toBeNull();
    expect(officialPairLiveMiss('Monthly')).toBe('Monthly');
    expect(officialPairLiveMiss('Weekly')).toBe('Weekly');
    expect(officialPairLiveMiss(null)).toBeNull();
    expect(officialPairLiveFailure('Monthly')).toBe('Couldn’t post to Monthly');
    expect(officialPairLiveFailure('Weekly')).toBe('Couldn’t post to Weekly');
  });
});
