import { describe, expect, it } from 'vitest';

import {
  PULSE_CAP,
  buildPulsePills,
  pulseChallengeHref,
  pulseSnippet,
  selectPulseChallenges,
  sortPulsePills,
} from '@/lib/homePulse';

describe('selectPulseChallenges', () => {
  it('keeps live and upcoming, drops ended and settled, and dedupes', () => {
    const rows = selectPulseChallenges([
      { id: 'live-1', status: 'live', title: 'Dawn run' },
      { id: 'up-1', status: 'upcoming', title: 'Open gym' },
      { id: 'ended-1', status: 'ended', title: 'Last week' },
      { id: 'settled-1', status: 'settled', title: 'Paid out' },
      { id: 'live-1', status: 'in_progress', title: 'Dawn run copy' },
      { id: 'official-1', status: 'arming', title: 'Official Weekly' },
    ]);
    expect(rows.map((row) => row.id)).toEqual(['live-1', 'up-1', 'official-1']);
  });
});

describe('pulseSnippet', () => {
  it('uses the Live line, Check-in Complete, or No chatter yet', () => {
    expect(pulseSnippet({ content: 'starting now', source: 'challenge' })).toBe('starting now');
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
});

describe('buildPulsePills', () => {
  it('caps at 12, sorts by last Live post, and keeps Official on the same chrome', () => {
    const challenges = Array.from({ length: 14 }, (_, index) => ({
      id: `c${index + 1}`,
      status: index === 13 ? 'ended' : 'live',
      title: index === 0 ? 'Official Weekly' : `Peer ${index + 1}`,
    }));
    const posts = [
      { id: 'p2', challenge_id: 'c2', content: 'starting now', author_id: 'a2', created_at: '2026-09-01T18:00:00.000Z' },
      { id: 'p1', challenge_id: 'c1', content: 'Check-in Complete', source: 'checkin', checkin_stage: 'complete', author_id: 'a1', created_at: '2026-09-01T12:00:00.000Z' },
      { id: 'p3', challenge_id: 'c3', content: 'later', author_id: 'a3', created_at: '2026-09-01T19:00:00.000Z' },
    ];
    const pills = buildPulsePills({ challenges, posts });
    expect(pills).toHaveLength(PULSE_CAP);
    expect(pills.map((row) => row.id).includes('c14')).toBe(false);
    expect(pills[0]).toMatchObject({ id: 'c3', snippet: 'later' });
    expect(pills[1]).toMatchObject({ id: 'c2', snippet: 'starting now' });
    expect(pills.find((row) => row.id === 'c1')).toMatchObject({
      title: 'Official Weekly',
      snippet: 'Check-in Complete',
    });
    expect(pills.find((row) => row.id === 'c4')?.snippet).toBe('No chatter yet');
  });

  it('takes up to three recent Live authors for the face pile', () => {
    const pills = buildPulsePills({
      challenges: [{ id: 'c1', status: 'live', title: 'Crew' }],
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
        challenges: [{ id: 'c1', status: 'live', title: 'Crew' }],
        posts: [{ challenge_id: 'c1', author: undefined, author_id: undefined, content: 'starting now' }],
      }),
    ).not.toThrow();
  });
});

describe('pulseChallengeHref', () => {
  it('opens Live for that challenge id only', () => {
    const href = String(pulseChallengeHref('abc-123'));
    expect(href).toContain('/challenges/abc-123');
    expect(href).toContain('tab=feed');
    expect(href).not.toContain('abc-999');
  });
});
