import { describe, expect, it } from 'vitest';

import { namedChallengeHref } from '@/lib/routes';
import {
  PULSE_CAP,
  buildPulsePills,
  countNewCheckins,
  isPulsePillEligible,
  partitionPulsePills,
  pulseActivityLine,
  pulseChallengeHref,
  pulsePrivacyLabel,
  pulseSnippet,
  selectPulseChallenges,
  sortPulsePills,
} from '@/lib/homePulse';

describe('selectPulseChallenges', () => {
  it('keeps joined live and upcoming, drops ended and settled, and dedupes', () => {
    const rows = selectPulseChallenges([
      { id: 'live-1', status: 'live', title: 'Dawn run', joined: true },
      { id: 'up-1', status: 'upcoming', title: 'Open gym', joined: true },
      { id: 'ended-1', status: 'ended', title: 'Last week', joined: true },
      { id: 'settled-1', status: 'settled', title: 'Paid out', joined: true },
      { id: 'live-1', status: 'in_progress', title: 'Dawn run copy', joined: true },
      { id: 'official-1', status: 'arming', title: 'Official Weekly', joined: true },
    ]);
    expect(rows.map((row) => row.id)).toEqual(['live-1', 'up-1', 'official-1']);
  });

  it('keeps hosting that is not ended, and drops hosted Ended pots', () => {
    const rows = selectPulseChallenges(
      [
        { id: 'host-live', status: 'live', title: 'Hosted live', hosting: true, created_by: 'me' },
        { id: 'host-ended', status: 'ended', title: 'Hosted ended', hosting: true, created_by: 'me' },
        { id: 'host-settled', status: 'settled', title: 'Hosted settled', hosting: true, created_by: 'me' },
      ],
      'me',
    );
    expect(rows.map((row) => row.id)).toEqual(['host-live']);
  });

  it('drops Official / peer that the Lobby Ended clock already moved', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(
      isPulsePillEligible({
        id: 'week-ended',
        status: 'live',
        title: 'Official Weekly',
        joined: true,
        ends_at: yesterday,
      }),
    ).toBe(false);
    expect(
      isPulsePillEligible({
        id: 'thirty-live',
        status: 'live',
        title: '30-Day Consistency',
        joined: true,
        duration_days: 30,
        length_value: 30,
        length_unit: 'days',
        days_required: 6,
        starts_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
        ends_at: yesterday,
      }),
    ).toBe(true);
    expect(
      selectPulseChallenges([
        { id: 'week-ended', status: 'live', title: 'Official Weekly', joined: true, ends_at: yesterday },
        { id: 'peer-ended', status: 'ended', title: 'Peer', joined: true },
        { id: 'live-30', status: 'live', title: '30-Day Consistency', joined: true },
      ]).map((row) => row.id),
    ).toEqual(['live-30']);
  });

  it('keeps observer Callout pills and drops ended watching', () => {
    const rows = selectPulseChallenges([
      { id: 'watch-live', status: 'live', title: 'Sit-ups', is_callout: true, watching: true },
      { id: 'watch-ended', status: 'ended', title: 'Old callout', is_callout: true, watching: true },
    ]);
    expect(rows.map((row) => row.id)).toEqual(['watch-live']);
  });

  it('never keeps public Active the viewer did not join, host, or watch', () => {
    const rows = selectPulseChallenges([
      { id: 'public-1', status: 'live', title: 'Random public' },
      { id: 'public-2', status: 'in_progress', title: 'Stranger pot' },
    ]);
    expect(rows).toEqual([]);
    expect(isPulsePillEligible({ id: 'public-1', status: 'live' })).toBe(false);
  });

  it('does not keep watching on a non-Callout, and dedupes joined + watching to one pill', () => {
    expect(
      selectPulseChallenges([{ id: 'plain', status: 'live', title: 'Peer', watching: true }]).map(
        (row) => row.id,
      ),
    ).toEqual([]);
    expect(
      selectPulseChallenges([
        { id: 'same', status: 'live', title: 'Sit-ups', joined: true, is_callout: true },
        { id: 'same', status: 'live', title: 'Sit-ups', watching: true, is_callout: true },
      ]).map((row) => row.id),
    ).toEqual(['same']);
  });
});

describe('pulseSnippet', () => {
  it('uses last check-in state, never the latest Live chat line', () => {
    expect(pulseSnippet({ content: '@Mrs. H was that the last lap?', source: 'challenge' })).toBe(
      'No chatter yet',
    );
    expect(pulseSnippet({ source: 'checkin', checkin_stage: 'started' })).toBe('Check-in');
    expect(pulseSnippet({ source: 'checkin', checkin_stage: 'complete' })).toBe('Check-in Complete');
    expect(pulseSnippet(null)).toBe('No chatter yet');
    expect(pulseSnippet({ content: '', media_urls: [] })).toBe('No chatter yet');
  });
});

describe('sortPulsePills', () => {
  it('puts the most recent chatter first and empty chatter last', () => {
    const sorted = sortPulsePills([
      { id: 'quiet', lastAt: null },
      { id: 'old', lastAt: '2026-09-01T10:00:00.000Z' },
      { id: 'new', lastAt: '2026-09-01T18:00:00.000Z' },
    ]);
    expect(sorted.map((row) => row.id)).toEqual(['new', 'old', 'quiet']);
  });

  it('holds the house rooms at the front, weekly then monthly, even with no chatter', () => {
    const sorted = sortPulsePills([
      { id: 'loud', lastAt: '2026-09-25T18:00:00.000Z' },
      { id: 'monthly', lastAt: null, officialCoinKind: 'coin_monthly' as const },
      { id: 'weekly', lastAt: null, officialCoinKind: 'coin_weekly' as const },
    ]);
    expect(sorted.map((row) => row.id)).toEqual(['weekly', 'monthly', 'loud']);
  });
});

describe('buildPulsePills', () => {
  it('keeps Official first, uses last Live or check-in for recency, and drops ended', () => {
    const challenges = Array.from({ length: 14 }, (_, index) => ({
      id: `c${index + 1}`,
      status: index === 13 ? 'ended' : 'live',
      title: index === 0 ? 'Official Weekly' : `Peer ${index + 1}`,
      joined: true,
      official_kind: index === 0 ? 'coin_weekly' : null,
    }));
    const posts = [
      { id: 'p2', challenge_id: 'c2', content: 'starting now', author_id: 'a2', created_at: '2026-09-01T18:00:00.000Z' },
      { id: 'p1', challenge_id: 'c1', content: 'Check-in Complete', source: 'checkin', checkin_stage: 'complete', author_id: 'a1', created_at: '2026-09-01T12:00:00.000Z' },
      { id: 'p3', challenge_id: 'c3', content: 'later', author_id: 'a3', created_at: '2026-09-01T19:00:00.000Z' },
    ];
    const pills = buildPulsePills({ challenges, posts });
    expect(pills).toHaveLength(13);
    expect(pills.map((row) => row.id).includes('c14')).toBe(false);
    expect(pills[0]).toMatchObject({
      id: 'c1',
      snippet: 'Check-in Complete',
      officialCoinKind: 'coin_weekly',
    });
    expect(pills.find((row) => row.id === 'c2')?.lastAt).toBe('2026-09-01T18:00:00.000Z');
    expect(pills.find((row) => row.id === 'c2')?.snippet).toBe('No chatter yet');
    expect(pills.find((row) => row.id === 'c3')?.snippet).toBe('No chatter yet');
    expect(pills.find((row) => row.id === 'c4')?.snippet).toBe('No chatter yet');
  });

  it('keeps Official on the rail and parks quiet rooms behind See More', () => {
    const now = Date.parse('2026-09-25T18:00:00.000Z');
    const rail = partitionPulsePills(
      [
        { id: 'quiet', lastAt: '2026-09-10T12:00:00.000Z' },
        { id: 'pinnacle', lastAt: '2026-09-23T14:00:00.000Z' },
        { id: 'monthly', lastAt: null, officialCoinKind: 'coin_monthly' as const },
        { id: 'weekly', lastAt: null, officialCoinKind: 'coin_weekly' as const },
        { id: 'silent', lastAt: null },
      ],
      now,
    );
    expect(rail.visible.map((row) => row.id)).toEqual(['weekly', 'monthly', 'pinnacle']);
    expect(rail.aged.map((row) => row.id)).toEqual(['quiet', 'silent']);
    expect(rail.visible.length).toBeLessThanOrEqual(PULSE_CAP);
  });

  it('keeps Check-in Complete when a later Live reply exists', () => {
    const pills = buildPulsePills({
      challenges: [{ id: 'c1', status: 'live', title: '30-Day', joined: true }],
      posts: [
        {
          challenge_id: 'c1',
          content: '@Mrs. H was that the last lap?',
          source: 'challenge',
          created_at: '2026-09-01T19:00:00.000Z',
        },
        {
          challenge_id: 'c1',
          source: 'checkin',
          checkin_stage: 'complete',
          created_at: '2026-09-01T12:00:00.000Z',
        },
      ],
    });
    expect(pills[0].snippet).toBe('Check-in Complete');
  });

  it('takes up to three recent Live authors for the face pile', () => {
    const pills = buildPulsePills({
      challenges: [{ id: 'c1', status: 'live', title: 'Crew', joined: true }],
      posts: [
        { challenge_id: 'c1', author: { id: 'a1' }, created_at: '2026-09-01T19:00:00.000Z', content: 'now' },
        { challenge_id: 'c1', author: undefined, author_id: 'a1', created_at: '2026-09-01T18:30:00.000Z', content: 'again' },
        { challenge_id: 'c1', author_id: 'a2', created_at: '2026-09-01T18:00:00.000Z', content: 'hi' },
        { challenge_id: 'c1', author: { id: undefined }, author_id: 'a3', created_at: '2026-09-01T17:00:00.000Z', content: 'yo' },
        { challenge_id: 'c1', author_id: 'a4', created_at: '2026-09-01T16:00:00.000Z', content: 'old' },
      ],
      profiles: [
        { id: 'a1', display_name: 'Ada', username: 'ada', avatar_url: 'https://cdn.example.com/a1.jpg' },
        { id: 'a2', display_name: 'Bea', username: 'bea', avatar_url: null },
      ],
    });
    expect(pills[0].faces.map((face) => face.id)).toEqual(['a1', 'a2', 'a3']);
    expect(pills[0].faces[0]).toMatchObject({ name: 'Ada', avatarUrl: 'https://cdn.example.com/a1.jpg' });
  });

  it('does not throw when author is missing', () => {
    expect(() =>
      buildPulsePills({
        challenges: [{ id: 'c1', status: 'live', title: 'Crew', joined: true }],
        posts: [{ challenge_id: 'c1', author: undefined, author_id: undefined, content: 'starting now' }],
      }),
    ).not.toThrow();
  });

  it('labels optional observer pills as watching, never Check In', () => {
    const pills = buildPulsePills({
      challenges: [{ id: 'watch-1', status: 'live', title: 'Callout: sit-ups', is_callout: true, watching: true }],
      posts: [],
    });
    expect(pills[0]).toMatchObject({
      id: 'watch-1',
      title: 'Callout: sit-ups',
      snippet: 'Watching',
      watching: true,
      isCallout: true,
    });
    expect(pills[0].snippet.toLowerCase()).not.toMatch(/check in|bet|odds|wager/);
  });

  it('uses fighter faces and vs / watching on Callout pills, never pot language', () => {
    const pills = buildPulsePills({
      challenges: [{ id: 'co-1', status: 'live', title: 'sit-ups', is_callout: true, joined: true }],
      posts: [
        {
          challenge_id: 'co-1',
          author_id: 'chat',
          content: 'pot odds?',
          created_at: '2026-09-01T19:00:00.000Z',
        },
      ],
      profiles: [{ id: 'chat', display_name: 'Chatty', username: 'chat', avatar_url: null }],
      viewerId: 'me',
      calloutParties: [
        {
          challengeId: 'co-1',
          calloutId: 'c',
          challengerId: 'me',
          opponentId: 'them',
          challenger: {
            id: 'me',
            username: 'me',
            display_name: 'Me',
            avatar_url: null,
            bio: null,
          },
          opponent: {
            id: 'them',
            username: 'lee',
            display_name: 'Lee',
            avatar_url: null,
            bio: null,
          },
          watchingCount: 3,
        },
      ],
    });
    expect(pills[0].title).toBe('Callout: sit-ups');
    expect(pills[0].faces.map((face) => face.id)).toEqual(['me', 'them']);
    expect(pills[0].snippet).toBe('vs Lee · 3 watching');
    expect(pills[0].snippet.toLowerCase()).not.toMatch(/odds|pot|bet|wager/);
  });
});

describe('pulsePrivacyLabel', () => {
  it('chips private and corporate, and leaves public peer rooms bare', () => {
    expect(pulsePrivacyLabel('private')).toBe('Private');
    expect(pulsePrivacyLabel('private_corporate')).toBe('Private');
    expect(pulsePrivacyLabel('public')).toBe('');
    expect(pulsePrivacyLabel(null)).toBe('');
  });
});

describe('countNewCheckins', () => {
  const now = Date.parse('2026-09-26T18:00:00.000Z');
  const posts = [
    { challenge_id: 'c1', source: 'checkin', created_at: '2026-09-26T17:00:00.000Z' },
    { challenge_id: 'c1', source: 'checkin', created_at: '2026-09-26T12:00:00.000Z' },
    { challenge_id: 'c1', source: 'checkin', created_at: '2026-09-20T12:00:00.000Z' },
    { challenge_id: 'c1', source: 'challenge', content: 'chat', created_at: '2026-09-26T17:30:00.000Z' },
    { challenge_id: 'c2', source: 'checkin', created_at: '2026-09-26T17:00:00.000Z' },
  ];

  it('counts only unseen check-ins in that room', () => {
    expect(countNewCheckins(posts, 'c1', '2026-09-26T13:00:00.000Z', now)).toBe(1);
    expect(countNewCheckins(posts, 'c1', '2026-09-26T11:00:00.000Z', now)).toBe(2);
  });

  it('falls back to the last day when they have never opened the room', () => {
    expect(countNewCheckins(posts, 'c1', null, now)).toBe(2);
  });

  it('ignores plain Live chat and other rooms', () => {
    expect(countNewCheckins(posts, 'c2', null, now)).toBe(1);
    expect(countNewCheckins(posts, 'nope', null, now)).toBe(0);
  });
});

describe('pulseActivityLine', () => {
  it('names the person who checked in', () => {
    expect(
      pulseActivityLine({
        latestCheckin: { created_at: '2026-09-26T17:00:00.000Z' },
        authorName: 'Daniel',
        relative: () => '4m ago',
      }),
    ).toBe('Daniel checked in 4m ago');
  });

  it('falls back to real consistency progress', () => {
    expect(pulseActivityLine({ progress: { done: 15, target: 30 } })).toBe('15 / 30 days');
  });

  it('says nothing rather than "No chatter yet" so the card can say Live now', () => {
    expect(pulseActivityLine({})).toBe('');
    expect(pulseActivityLine({ progress: { done: 0, target: 0 } })).toBe('');
  });
});

describe('buildPulsePills card data', () => {
  it('binds the real skin fields instead of hardcoded mock values', () => {
    const pills = buildPulsePills({
      challenges: [
        {
          id: 'weekly',
          status: 'live',
          title: 'Weekly Fitness Challenge',
          joined: true,
          official_kind: 'coin_weekly',
          is_official: true,
          category: 'fitness',
          privacy_mode: 'public',
        },
        {
          id: 'thirty',
          status: 'live',
          title: '30-Day Consistency',
          joined: true,
          category: 'fitness',
          privacy_mode: 'private',
          cover_image_url: 'https://cdn.example.com/run.jpg',
          days_required: 30,
        },
      ],
      posts: [
        {
          challenge_id: 'thirty',
          source: 'checkin',
          checkin_stage: 'complete',
          author_id: 'a1',
          created_at: '2026-09-26T17:00:00.000Z',
        },
      ],
      profiles: [{ id: 'a1', display_name: 'Daniel', username: 'dh', avatar_url: null }],
      memberCounts: { weekly: 52, thirty: 11 },
      lastReadAt: { weekly: null, thirty: null },
      progress: { thirty: { done: 15, target: 30 } },
      relative: () => '4m ago',
      now: Date.parse('2026-09-26T18:00:00.000Z'),
    });

    const weekly = pills.find((row) => row.id === 'weekly');
    expect(weekly).toMatchObject({ isOfficial: true, category: 'fitness', coverUrl: null });
    // 52 in the room, no faces yet, so the pile is all overflow.
    expect(weekly?.faceOverflow).toBe(52);

    const thirty = pills.find((row) => row.id === 'thirty');
    expect(thirty).toMatchObject({
      isOfficial: false,
      coverUrl: 'https://cdn.example.com/run.jpg',
      privacyMode: 'private',
      activityLine: '15 / 30 days',
    });
    expect(thirty?.faceOverflow).toBe(10);
    expect(pulsePrivacyLabel(thirty?.privacyMode)).toBe('Private');
  });

  it('uses progress when nobody has checked in yet', () => {
    const pills = buildPulsePills({
      challenges: [
        { id: 'thirty', status: 'live', title: '30-Day', joined: true, days_required: 30 },
      ],
      posts: [],
      progress: { thirty: { done: 15, target: 30 } },
    });
    expect(pills[0].activityLine).toBe('15 / 30 days');
  });

  it('prints 0 / 50 km the day a distance room is created', () => {
    const pills = buildPulsePills({
      challenges: [
        {
          id: 'km',
          status: 'live',
          title: 'Autumn ride',
          joined: true,
          format: 'cumulative',
          challenge_type: 'cumulative',
          duration_days: 14,
          metrics: [{ id: 'm1', target: 50, name: 'km', unit: 'km' }],
        },
      ],
      posts: [],
    });
    expect(pills[0]?.activityLine).toBe('0 / 50 km');
  });

  it('prints days for a consistency room whose title mentions km', () => {
    const pills = buildPulsePills({
      challenges: [
        {
          id: 'days',
          status: 'live',
          title: '50 km club',
          joined: true,
          format: 'consistency',
          challenge_type: 'consistency',
          duration_days: 30,
        },
      ],
      posts: [],
    });
    expect(pills[0]?.activityLine).toBe('0 / 30 days');
  });

  it('leaves the activity line empty on a silent room', () => {
    const pills = buildPulsePills({
      challenges: [{ id: 'quiet', status: 'live', title: 'Quiet', joined: true }],
      posts: [],
    });
    expect(pills[0].activityLine).toBe('');
    expect(pills[0].faceOverflow).toBe(0);
  });
});

describe('namedChallengeHref', () => {
  it('opens Live for a Home named tap with no postId', () => {
    const href = String(namedChallengeHref('abc-123'));
    expect(href).toBe('/challenges/abc-123?tab=live');
  });
});

describe('pulseChallengeHref', () => {
  it('opens Live for that challenge id only', () => {
    const href = String(pulseChallengeHref('abc-123'));
    expect(href).toContain('/challenges/abc-123');
    expect(href).toContain('tab=live');
    expect(href).not.toBe('/challenges');
    expect(href).not.toContain('returnTo');
    expect(href).not.toContain('abc-999');
    expect(href).not.toContain('/submit');
  });
});
