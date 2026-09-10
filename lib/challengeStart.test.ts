import { describe, expect, it } from 'vitest';

import { canHouseEditChallenge, formatStartMovedDate, startMovedBody } from '@/lib/challengeStart';

describe('House edit', () => {
  it('lets official_ops edit a live challenge they do not host, not after settled', () => {
    expect(canHouseEditChallenge({ challenge: { status: 'live' }, officialOps: true })).toBe(true);
    expect(canHouseEditChallenge({ challenge: { status: 'live' }, officialOps: false })).toBe(false);
    expect(canHouseEditChallenge({ challenge: { status: 'settled' }, officialOps: true })).toBe(false);
  });
});

describe('start-rolled copy', () => {
  it('prints Sep 6 for a 7pm Denver start stored as Sep 7 UTC', () => {
    expect(formatStartMovedDate('2026-09-07T01:00:00.000Z', 'America/Denver')).toBe('Sep 6');
    expect(startMovedBody({ starts_at: '2026-09-07T01:00:00.000Z', timezone: 'America/Denver' })).toBe(
      'Not enough people yet. Start moved to Sep 6.',
    );
  });

  it('uses America/Denver when the challenge has no timezone', () => {
    expect(formatStartMovedDate('2026-09-07T01:00:00.000Z')).toBe('Sep 6');
  });
});
