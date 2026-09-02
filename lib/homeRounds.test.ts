import { describe, expect, it } from 'vitest';

import {
  isHomeRoundsCoach,
  isRestrictedRoundChallenge,
  pickHostedRoundChallengeId,
  reelBelongsOnHomeRounds,
  selectHomeRounds,
} from '@/lib/homeRounds';

const ctx = (over: Partial<Parameters<typeof selectHomeRounds>[1]> = {}) => ({
  liveOrUpcomingChallengeIds: new Set<string>(),
  memberChallengeIds: new Set<string>(),
  restrictedChallengeIds: new Set<string>(),
  followedCoachIds: [] as string[],
  ...over,
});

describe('selectHomeRounds', () => {
  it('keeps a host Round tagged to a live challenge the viewer is in', () => {
    const picked = selectHomeRounds(
      [
        { id: 'r1', user_id: 'host', challenge_id: '30-day', created_at: '2026-09-01T12:00:00.000Z' },
        { id: 'friend', user_id: 'pal', challenge_id: null, created_at: '2026-09-01T13:00:00.000Z' },
      ],
      ctx({ liveOrUpcomingChallengeIds: new Set(['30-day']) }),
    );
    expect(picked.map((row) => row.id)).toEqual(['r1']);
  });

  it('keeps a Followed Official Round even when the viewer is not in that challenge', () => {
    const picked = selectHomeRounds(
      [{ id: 'coach', user_id: 'official', challenge_id: 'other', created_at: '2026-09-01T12:00:00.000Z' }],
      ctx({ followedCoachIds: ['official'] }),
    );
    expect(picked.map((row) => row.id)).toEqual(['coach']);
  });

  it('drops a non-host friend’s Round (Waves only)', () => {
    expect(
      reelBelongsOnHomeRounds(
        { id: 'wave-friend', user_id: 'pal', challenge_id: null },
        ctx({ liveOrUpcomingChallengeIds: new Set(['30-day']) }),
      ),
    ).toBe(false);
  });

  it('drops an ended-challenge Round from path 1, keeps it for a Followed Coach', () => {
    const ended = { id: 'old', user_id: 'host', challenge_id: 'ended-30', created_at: '2026-08-01T12:00:00.000Z' };
    expect(selectHomeRounds([ended], ctx({ liveOrUpcomingChallengeIds: new Set() }))).toEqual([]);
    expect(
      selectHomeRounds([ended], ctx({ followedCoachIds: ['host'] })).map((row) => row.id),
    ).toEqual(['old']);
  });

  it('never shows a private or corporate Round to a stranger, even if they Follow the host', () => {
    const secret = { id: 'corp', user_id: 'coach', challenge_id: 'corp-1' };
    expect(
      reelBelongsOnHomeRounds(
        secret,
        ctx({
          followedCoachIds: ['coach'],
          restrictedChallengeIds: new Set(['corp-1']),
          memberChallengeIds: new Set(),
        }),
      ),
    ).toBe(false);
    expect(
      reelBelongsOnHomeRounds(
        secret,
        ctx({
          liveOrUpcomingChallengeIds: new Set(['corp-1']),
          memberChallengeIds: new Set(['corp-1']),
          restrictedChallengeIds: new Set(['corp-1']),
        }),
      ),
    ).toBe(true);
  });

  it('orders Followed Coach Rounds by follow order (pin stub)', () => {
    const picked = selectHomeRounds(
      [
        { id: 'older-follow', user_id: 'coach-a', created_at: '2026-09-01T18:00:00.000Z' },
        { id: 'newer-follow', user_id: 'coach-b', created_at: '2026-09-01T10:00:00.000Z' },
      ],
      ctx({ followedCoachIds: ['coach-b', 'coach-a'] }),
    );
    expect(picked.map((row) => row.id)).toEqual(['newer-follow', 'older-follow']);
  });

  it('puts live-challenge Rounds before Followed Coach Rounds so pins cannot hide (1)', () => {
    const picked = selectHomeRounds(
      [
        { id: 'coach', user_id: 'official', challenge_id: null, created_at: '2026-09-01T18:00:00.000Z' },
        { id: 'mine', user_id: 'host', challenge_id: '30-day', created_at: '2026-09-01T10:00:00.000Z' },
      ],
      ctx({
        liveOrUpcomingChallengeIds: new Set(['30-day']),
        followedCoachIds: ['official'],
      }),
    );
    expect(picked.map((row) => row.id)).toEqual(['mine', 'coach']);
  });
});

describe('isHomeRoundsCoach', () => {
  it('treats Official and paid Creators as Coaches, not plain friends', () => {
    expect(isHomeRoundsCoach({ is_official: true })).toBe(true);
    expect(isHomeRoundsCoach({ is_creator: true })).toBe(true);
    expect(isHomeRoundsCoach({ is_official: false, is_creator: false })).toBe(false);
  });
});

describe('isRestrictedRoundChallenge', () => {
  it('flags private and corporate challenges', () => {
    expect(isRestrictedRoundChallenge({ privacy_mode: 'private_corporate' })).toBe(true);
    expect(isRestrictedRoundChallenge({ privacy_mode: 'private' })).toBe(true);
    expect(isRestrictedRoundChallenge({ visibility: 'invite' })).toBe(true);
    expect(isRestrictedRoundChallenge({ privacy_mode: 'public', visibility: 'public' })).toBe(false);
  });
});

describe('pickHostedRoundChallengeId', () => {
  it('tags the hosted live challenge only', () => {
    expect(
      pickHostedRoundChallengeId(
        [
          { id: 'joined', created_by: 'other', status: 'live' },
          { id: 'ended', created_by: 'me', status: 'ended' },
          { id: 'hosted', created_by: 'me', status: 'live' },
        ],
        'me',
      ),
    ).toBe('hosted');
  });
});
