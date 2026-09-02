import { describe, expect, it } from 'vitest';

import {
  CALLOUT_CHEER_PLACEHOLDER,
  CALLOUT_TITLE_PREFIX,
  CALLOUT_WATCHING_LINE,
  calloutActiveChallengeHref,
  calloutAlertTitle,
  calloutCardBorder,
  calloutCardChrome,
  calloutCardMetaLine,
  calloutPartySubtitle,
  calloutVsLine,
  calloutFormatLabel,
  calloutFormatOf,
  calloutHonorNeeded,
  calloutObserverInviteHref,
  calloutProofsForCreate,
  calloutRulesLine,
  calloutRankedWinner,
  calloutTask,
  calloutTaskOk,
  calloutTitle,
  calloutWatchingCountLabel,
  filterCalloutPeople,
  isCalloutChallenge,
  isCalloutChallengeObserver,
  isCalloutRosterLive,
  isCalloutRosterSeat,
  CALLOUT_EXPIRED_COPY,
  CALLOUT_PENDING_CAP_COPY,
  calloutCreateBlocked,
  calloutRematchHref,
  isCalloutInviteExpired,
  outgoingPendingCallouts,
  pendingHomeCallouts,
  selectCalloutObserverIds,
  selectCalloutOpponentIds,
} from '@/lib/callouts';
import { CALLOUT_PROOF_CAP } from '@/lib/challengeProofs';
import { THEME } from '@/lib/theme';
import type { Callout, PublicProfile } from '@/lib/types';

function person(id: string, username: string, display_name = ''): PublicProfile {
  return {
    id,
    username,
    display_name,
    avatar_url: null,
    bio: null,
  } as PublicProfile;
}

describe('calloutTitle', () => {
  it('always shows the Callout: prefix and does not double it', () => {
    expect(calloutTitle('30-min skill')).toBe('Callout: 30-min skill');
    expect(calloutTitle('Callout: 30-min skill')).toBe('Callout: 30-min skill');
    expect(calloutTitle('callout:  miles')).toBe('Callout: miles');
    expect(calloutTitle('')).toBe(CALLOUT_TITLE_PREFIX);
    expect(calloutTask('Callout: 30-min skill')).toBe('30-min skill');
    expect(calloutTaskOk('ab')).toBe(false);
    expect(calloutTaskOk('Callout: 30-min skill')).toBe(true);
  });

  it('formats alert copy from stored title', () => {
    expect(calloutAlertTitle('You’ve been called out', 'Callout: 30-min skill')).toBe(
      'Callout: 30-min skill',
    );
    expect(calloutAlertTitle('You’ve been called out')).toBe('Callout: You’ve been called out');
  });
});

describe('selectCalloutOpponentIds', () => {
  it('keeps friends and live roster mates, drops self blocked and pending pairs', () => {
    expect(
      selectCalloutOpponentIds({
        me: 'me',
        friends: ['me', 'friend', 'blocked-friend'],
        rosterMates: ['roster', 'friend', 'pending-roster'],
        blocked: ['blocked-friend'],
        pendingPairIds: ['pending-roster'],
      }),
    ).toEqual(['friend', 'roster']);
  });
});

describe('isCalloutRosterLive', () => {
  it('counts open and live, not ended or draft', () => {
    expect(isCalloutRosterLive('live')).toBe(true);
    expect(isCalloutRosterLive('open')).toBe(true);
    expect(isCalloutRosterLive('filling')).toBe(true);
    expect(isCalloutRosterLive('ended')).toBe(false);
    expect(isCalloutRosterLive('settled')).toBe(false);
    expect(isCalloutRosterLive('draft')).toBe(false);
    expect(isCalloutRosterSeat('joined')).toBe(true);
    expect(isCalloutRosterSeat('withdrawn')).toBe(false);
  });
});

describe('pendingHomeCallouts', () => {
  it('only keeps pending rows for the two fighters, never a watcher', () => {
    const rows = [
      { id: 'a', status: 'pending', challenger_id: 'me', opponent_id: 'them' },
      { id: 'b', status: 'active', challenger_id: 'me', opponent_id: 'them' },
      { id: 'c', status: 'pending', challenger_id: 'other', opponent_id: 'else' },
    ] as Callout[];
    expect(pendingHomeCallouts(rows, 'me').map((row) => row.id)).toEqual(['a']);
    expect(pendingHomeCallouts(rows, 'watcher').map((row) => row.id)).toEqual([]);
  });

  it('drops expired pending pins and never expires an active hold', () => {
    const now = Date.parse('2026-09-04T12:00:00.000Z');
    const rows = [
      {
        id: 'old',
        status: 'pending',
        held: false,
        challenger_id: 'me',
        opponent_id: 'them',
        expires_at: '2026-09-04T11:00:00.000Z',
      },
      {
        id: 'live',
        status: 'pending',
        held: false,
        challenger_id: 'them',
        opponent_id: 'me',
        expires_at: '2026-09-05T12:00:00.000Z',
      },
      {
        id: 'held',
        status: 'active',
        held: true,
        challenger_id: 'me',
        opponent_id: 'them',
        expires_at: '2026-09-01T12:00:00.000Z',
      },
    ] as Callout[];
    expect(pendingHomeCallouts(rows, 'me', now).map((row) => row.id)).toEqual(['live']);
    expect(isCalloutInviteExpired(rows[2], now)).toBe(false);
    expect(CALLOUT_EXPIRED_COPY).toBe('Callout expired.');
  });
});

describe('outgoing pending cap', () => {
  it('blocks a fourth outgoing pending and leaves incoming uncapped', () => {
    const now = Date.parse('2026-09-04T12:00:00.000Z');
    const outgoing = [1, 2, 3].map((n) => ({
      id: `out-${n}`,
      status: 'pending' as const,
      held: false,
      challenger_id: 'me',
      opponent_id: `them-${n}`,
      expires_at: '2026-09-05T12:00:00.000Z',
    }));
    const incoming = [1, 2, 3, 4].map((n) => ({
      id: `in-${n}`,
      status: 'pending' as const,
      held: false,
      challenger_id: `friend-${n}`,
      opponent_id: 'me',
      expires_at: '2026-09-05T12:00:00.000Z',
    }));
    const rows = [...outgoing, ...incoming] as Callout[];
    expect(outgoingPendingCallouts(rows, 'me', now)).toHaveLength(3);
    expect(calloutCreateBlocked(rows, 'me', now)).toBe(true);
    expect(pendingHomeCallouts(rows, 'me', now)).toHaveLength(7);
    expect(CALLOUT_PENDING_CAP_COPY).toBe('Finish or cancel one Callout first.');
    expect(calloutRematchHref('co-1')).toBe('/challenges/callout/create?rematch=co-1');
  });
});

describe('selectCalloutObserverIds', () => {
  it('uses the friend and roster pool minus fighters, self, blocked, and watchers', () => {
    expect(
      selectCalloutObserverIds({
        me: 'challenger',
        fighters: ['challenger', 'opponent'],
        friends: ['friend', 'opponent', 'blocked'],
        rosterMates: ['roster', 'watching'],
        blocked: ['blocked'],
        alreadyWatching: ['watching'],
      }),
    ).toEqual(['friend', 'roster']);
  });
});

describe('CALLOUT_WATCHING_LINE', () => {
  it('says watching with no entry or prize and never betting copy', () => {
    expect(CALLOUT_WATCHING_LINE).toBe('Watching — no entry, no prize.');
    expect(CALLOUT_WATCHING_LINE.toLowerCase()).not.toMatch(/bet|odds|side pot|wager/);
    expect(CALLOUT_CHEER_PLACEHOLDER).toBe('Cheer them on…');
    expect(CALLOUT_CHEER_PLACEHOLDER.toLowerCase()).not.toMatch(/bet|odds|side pot|wager/);
    expect(calloutWatchingCountLabel(0)).toBe('');
    expect(calloutWatchingCountLabel(1)).toBe('1 watching');
    expect(calloutWatchingCountLabel(3)).toBe('3 watching');
  });
});

describe('calloutActiveChallengeHref', () => {
  it('opens the attached challenge after accept, not while pending', () => {
    expect(calloutActiveChallengeHref({ challenge_id: 'ch-1', status: 'pending' })).toBeNull();
    expect(calloutActiveChallengeHref({ challenge_id: null, status: 'active' })).toBeNull();
    expect(calloutActiveChallengeHref({ challenge_id: 'ch-1', status: 'active' })).toBe(
      '/challenges/ch-1?tab=overview',
    );
    expect(calloutActiveChallengeHref({ challenge_id: 'ch-1', status: 'active' }, { tab: 'feed' })).toBe(
      '/challenges/ch-1?tab=feed',
    );
    expect(isCalloutChallenge({ is_callout: true })).toBe(true);
    expect(isCalloutChallenge({ is_callout: false })).toBe(false);
    expect(calloutCardBorder(true)).toBe(THEME.callout);
    expect(calloutCardBorder(false)).toBeUndefined();
    expect(calloutCardChrome(false)).toBeNull();
    expect(calloutCardChrome(true)).toEqual({
      borderColor: THEME.callout,
      backgroundColor: THEME.calloutSoft,
      wash: THEME.calloutWash,
    });
    expect(calloutVsLine('Lee')).toBe('vs Lee');
    expect(calloutVsLine('vs Lee')).toBe('vs Lee');
    expect(calloutVsLine('')).toBe('');
    expect(
      calloutPartySubtitle(
        {
          challengeId: 'ch',
          calloutId: 'co',
          challengerId: 'me',
          opponentId: 'them',
          challenger: person('me', 'me', 'Me'),
          opponent: person('them', 'lee', 'Lee'),
          watchingCount: 2,
        },
        'me',
      ),
    ).toBe('vs Lee');
    expect(
      calloutCardMetaLine(
        {
          challengeId: 'ch',
          calloutId: 'co',
          challengerId: 'me',
          opponentId: 'them',
          challenger: person('me', 'me', 'Me'),
          opponent: person('them', 'lee', 'Lee'),
          watchingCount: 2,
        },
        'me',
      ),
    ).toBe('vs Lee · 2 watching');
    expect(calloutCardMetaLine(null).toLowerCase()).not.toMatch(/odds|pot|bet|wager/);
  });
});

describe('callout observers', () => {
  const callout = { challenger_id: 'a', opponent_id: 'b' };

  it('treats invited friends as watchers, never fighters', () => {
    expect(isCalloutChallengeObserver(callout, ['friend'], 'friend')).toBe(true);
    expect(isCalloutChallengeObserver(callout, ['friend'], 'a')).toBe(false);
    expect(isCalloutChallengeObserver(callout, ['friend'], 'stranger')).toBe(false);
  });

  it('opens Live after accept, or the Callout screen while pending', () => {
    expect(calloutObserverInviteHref({ challenge_id: 'ch-1', callout_id: 'co-1' })).toBe(
      '/challenges/ch-1?tab=feed',
    );
    expect(calloutObserverInviteHref({ callout_id: 'co-1' })).toBe('/challenges/callout/co-1');
    expect(String(calloutObserverInviteHref({ challenge_id: 'ch-1' }))).not.toContain('accept');
  });
});

describe('callout proofs and rank', () => {
  it('defaults to one photo caption and caps at three', () => {
    const skipped = calloutProofsForCreate([]);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]?.method).toBe('photo');
    expect(skipped[0]?.name.toLowerCase()).toContain('photo');
    expect(calloutFormatOf('points')).toBe('points');
    expect(calloutFormatOf('consistency')).toBe('consistency');
    expect(calloutFormatLabel('points')).toBe('Points');
    expect(calloutRulesLine({ format: 'points', proofs: skipped })).toBe(
      'Points · Post a photo of the work.',
    );
    expect(calloutRulesLine({ format: 'consistency', proofs: [] }).toLowerCase()).not.toMatch(
      /odds|pot|bet|wager/,
    );
    expect(CALLOUT_PROOF_CAP).toBe(3);
  });

  it('ranks points higher and consistency days only when both completed', () => {
    const a = { id: 'a', complete: true, days: 2, points: 20 };
    const b = { id: 'b', complete: true, days: 1, points: 10 };
    expect(calloutRankedWinner({ format: 'points', challenger: a, opponent: b })).toBe('a');
    expect(calloutRankedWinner({ format: 'consistency', challenger: a, opponent: b })).toBe('a');
    expect(
      calloutRankedWinner({
        format: 'points',
        challenger: { ...a, points: 10 },
        opponent: b,
      }),
    ).toBeNull();
    expect(
      calloutHonorNeeded({
        format: 'points',
        challenger: { ...a, complete: false },
        opponent: b,
      }),
    ).toBe(true);
    expect(calloutHonorNeeded({ format: 'points', disputed: true, challenger: a, opponent: b })).toBe(
      true,
    );
  });
});

describe('filterCalloutPeople', () => {
  it('searches handle and name and keeps a single list', () => {
    const people = [person('1', 'sam', 'Sam Settled'), person('2', 'lee', 'Lee')];
    expect(filterCalloutPeople(people, 'sam').map((row) => row.id)).toEqual(['1']);
    expect(filterCalloutPeople(people, '@lee').map((row) => row.id)).toEqual(['2']);
    expect(filterCalloutPeople(people, '').map((row) => row.id)).toEqual(['1', '2']);
  });
});
