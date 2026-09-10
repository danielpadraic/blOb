import { describe, expect, it, beforeEach } from 'vitest';

import {
  laterLiveTimestamp,
  peekLiveLastRead,
  resetLiveLastReadForTests,
  writeLiveLastRead,
} from '@/lib/liveLastRead';

describe('live last-read cursor', () => {
  beforeEach(() => {
    resetLiveLastReadForTests();
  });

  it('stores per user and challenge and only moves forward', () => {
    expect(peekLiveLastRead('u1', 'c1')).toBeNull();
    expect(writeLiveLastRead('u1', 'c1', '2026-09-10T17:00:00.000Z')).toBe('2026-09-10T17:00:00.000Z');
    expect(writeLiveLastRead('u1', 'c1', '2026-09-10T16:00:00.000Z')).toBe('2026-09-10T17:00:00.000Z');
    expect(writeLiveLastRead('u1', 'c1', '2026-09-10T18:00:00.000Z')).toBe('2026-09-10T18:00:00.000Z');
    expect(peekLiveLastRead('u1', 'c1')).toBe('2026-09-10T18:00:00.000Z');
    expect(peekLiveLastRead('u1', 'c2')).toBeNull();
  });

  it('picks the later timestamp', () => {
    expect(laterLiveTimestamp('2026-09-10T17:00:00.000Z', '2026-09-10T18:00:00.000Z')).toBe(
      '2026-09-10T18:00:00.000Z',
    );
    expect(laterLiveTimestamp('nope', '2026-09-10T18:00:00.000Z')).toBe('2026-09-10T18:00:00.000Z');
  });
});
