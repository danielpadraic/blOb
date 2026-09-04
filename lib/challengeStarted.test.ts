import { describe, expect, it } from 'vitest';

import { hasChallengeStarted } from '@/lib/settlement';

const NOW = new Date('2026-09-04T18:00:00.000Z');

describe('hasChallengeStarted', () => {
  it('is false while a live row still has a future starts_at', () => {
    expect(
      hasChallengeStarted({ status: 'live', starts_at: '2026-09-06T06:00:00.000Z' }, NOW),
    ).toBe(false);
  });

  it('is true once starts_at has passed', () => {
    expect(
      hasChallengeStarted({ status: 'live', starts_at: '2026-09-01T06:00:00.000Z' }, NOW),
    ).toBe(true);
  });

  it('treats a live row with no starts_at as started', () => {
    expect(hasChallengeStarted({ status: 'live' }, NOW)).toBe(true);
    expect(hasChallengeStarted({ status: 'live', starts_at: null }, NOW)).toBe(true);
    expect(hasChallengeStarted({ status: 'live', starts_at: 'not-a-date' }, NOW)).toBe(true);
  });

  it('waits for the later of starts_at and official_started_at', () => {
    expect(
      hasChallengeStarted(
        {
          status: 'live',
          starts_at: '2026-09-01T06:00:00.000Z',
          official_started_at: '2026-09-06T06:00:00.000Z',
        },
        NOW,
      ),
    ).toBe(false);
  });

  it('stays false for any status that is not live', () => {
    expect(
      hasChallengeStarted({ status: 'open', starts_at: '2026-09-01T06:00:00.000Z' }, NOW),
    ).toBe(false);
    expect(hasChallengeStarted({ status: 'judging' }, NOW)).toBe(false);
  });
});
