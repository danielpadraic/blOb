import { describe, expect, it } from 'vitest';

import {
  DEFAULT_JOIN_UNTIL_PRESET,
  JOIN_CLOSED_COPY,
  inferJoinUntilPreset,
  inviteJoinOpenAfterStart,
  isJoinUntilClockOpen,
  isJoinWindowOpen,
  joinChallengeGate,
  joinOpenUntilLine,
  joinUntilReviewLine,
  periodCountsAsMissForJoiner,
  realMoneyBuyIn,
  resolveJoinUntilAt,
  storedJoinUntilAt,
} from '@/lib/joinWindow';

describe('join until', () => {
  const start = new Date('2026-09-11T16:00:00.000Z');

  it('defaults new creates to 24 hours after start', () => {
    expect(DEFAULT_JOIN_UNTIL_PRESET).toBe('after_24h');
    expect(resolveJoinUntilAt({ startsAt: start, preset: 'after_24h' })?.toISOString()).toBe(
      '2026-09-12T16:00:00.000Z',
    );
  });

  it('resolves the four presets plus custom', () => {
    expect(resolveJoinUntilAt({ startsAt: start, preset: 'at_start' })?.toISOString()).toBe(
      start.toISOString(),
    );
    expect(resolveJoinUntilAt({ startsAt: start, preset: 'after_3d' })?.toISOString()).toBe(
      '2026-09-14T16:00:00.000Z',
    );
    expect(
      resolveJoinUntilAt({ startsAt: start, preset: 'first_period', frequency: 'daily' })?.toISOString(),
    ).toBe('2026-09-12T16:00:00.000Z');
    expect(
      resolveJoinUntilAt({
        startsAt: start,
        preset: 'custom',
        customAt: '2026-09-20T18:00:00.000Z',
      })?.toISOString(),
    ).toBe('2026-09-20T18:00:00.000Z');
  });

  it('treats a null stored window as At start so live rooms stay closed', () => {
    const until = storedJoinUntilAt({ join_until_at: null, starts_at: start.toISOString() });
    expect(until?.toISOString()).toBe(start.toISOString());
    expect(inferJoinUntilPreset({ startsAt: start, joinUntilAt: until })).toBe('at_start');
    expect(
      isJoinWindowOpen(
        { status: 'live', starts_at: start.toISOString(), join_until_at: null },
        new Date('2026-09-11T17:00:00.000Z'),
      ),
    ).toBe(false);
  });

  it('lets a user join after start until the window, then Join closed', () => {
    const challenge = {
      status: 'live',
      starts_at: start.toISOString(),
      join_until_at: '2026-09-12T16:00:00.000Z',
    };
    expect(isJoinWindowOpen(challenge, new Date('2026-09-11T20:00:00.000Z'))).toBe(true);
    expect(isJoinWindowOpen(challenge, new Date('2026-09-12T16:00:00.000Z'))).toBe(false);
    expect(joinChallengeGate(challenge, new Date('2026-09-12T16:00:00.000Z')).reason).toBe(
      'JOIN_CLOSED',
    );
    expect(JOIN_CLOSED_COPY).toBe('Sorry, this Challenge isn’t taking new people.');
  });

  it('keeps Official weekly filling/arming only', () => {
    const weekly = {
      status: 'live',
      is_official: true,
      series_id: 'week_10',
      starts_at: start.toISOString(),
      join_until_at: '2026-09-20T16:00:00.000Z',
    };
    expect(isJoinWindowOpen(weekly, new Date('2026-09-11T20:00:00.000Z'))).toBe(false);
    expect(joinChallengeGate(weekly).reason).toBe('ALREADY_STARTED');
    expect(
      joinChallengeGate({ ...weekly, status: 'filling' }, new Date('2026-09-11T20:00:00.000Z')).ok,
    ).toBe(true);
  });

  it('prints Join open until while the window is open', () => {
    const line = joinOpenUntilLine(
      {
        starts_at: start.toISOString(),
        join_until_at: '2026-09-12T16:00:00.000Z',
        timezone: 'UTC',
      },
      new Date('2026-09-11T17:00:00.000Z'),
    );
    expect(line).toMatch(/^Join open until /);
    expect(
      joinOpenUntilLine(
        {
          starts_at: start.toISOString(),
          join_until_at: '2026-09-12T16:00:00.000Z',
        },
        new Date('2026-09-12T17:00:00.000Z'),
      ),
    ).toBeNull();
  });

  it('reviews join-until in plain English', () => {
    expect(joinUntilReviewLine({ startsAt: start, preset: 'after_24h' })).toBe(
      'People can join until 24 hours after start.',
    );
    expect(joinUntilReviewLine({ startsAt: start, preset: 'at_start' })).toBe(
      'People can join until the start.',
    );
  });

  it('lets a private $0 invitee join after start until settle', () => {
    const pinnacle = {
      status: 'live',
      privacy_mode: 'private_corporate',
      currency: 'coins',
      buy_in_amount: 0,
      host_funded: true,
      prize_pool: 0,
      starts_at: start.toISOString(),
      join_until_at: null,
    };
    const afterStart = new Date('2026-09-22T16:00:00.000Z');
    expect(realMoneyBuyIn(pinnacle)).toBe(false);
    expect(inviteJoinOpenAfterStart(pinnacle)).toBe(true);
    expect(isJoinUntilClockOpen(pinnacle, afterStart)).toBe(false);
    expect(isJoinWindowOpen(pinnacle, afterStart)).toBe(true);
    expect(joinChallengeGate(pinnacle, afterStart).ok).toBe(true);
    expect(
      isJoinWindowOpen({ ...pinnacle, status: 'settled' }, afterStart),
    ).toBe(false);
  });

  it('keeps public and cash rooms closed after the stored window', () => {
    const afterStart = new Date('2026-09-11T17:00:00.000Z');
    expect(
      isJoinWindowOpen(
        {
          status: 'live',
          privacy_mode: 'public',
          currency: 'coins',
          buy_in_amount: 0,
          starts_at: start.toISOString(),
          join_until_at: null,
        },
        afterStart,
      ),
    ).toBe(false);
    expect(
      joinChallengeGate(
        {
          status: 'live',
          privacy_mode: 'private',
          currency: 'bucks',
          buy_in_amount: 10,
          starts_at: start.toISOString(),
          join_until_at: null,
        },
        afterStart,
      ).reason,
    ).toBe('JOIN_CLOSED');
    expect(
      realMoneyBuyIn({ currency: 'bucks', buy_in_amount: 10 }),
    ).toBe(true);
    expect(
      realMoneyBuyIn({ currency: 'bucks', buy_in_amount: 0 }),
    ).toBe(false);
    expect(
      inviteJoinOpenAfterStart({
        status: 'live',
        privacy_mode: 'private',
        currency: 'coins',
        buy_in_amount: 5,
      }),
    ).toBe(true);
  });

  it('does not count consistency periods that ended before the joiner arrived', () => {
    expect(
      periodCountsAsMissForJoiner({
        periodStart: '2026-09-11T00:00:00.000Z',
        periodEndsAt: '2026-09-12T00:00:00.000Z',
        joinedAt: '2026-09-13T12:00:00.000Z',
      }),
    ).toBe(false);
    expect(
      periodCountsAsMissForJoiner({
        periodStart: '2026-09-13T00:00:00.000Z',
        periodEndsAt: '2026-09-14T00:00:00.000Z',
        joinedAt: '2026-09-13T12:00:00.000Z',
      }),
    ).toBe(true);
  });
});
