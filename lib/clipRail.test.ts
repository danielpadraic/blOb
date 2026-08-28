import { describe, expect, it } from 'vitest';

import { buildRoundStack, buildWaveStack, filterStoriesForRail, newestFirstStories, railHasVisibleWaves } from '@/lib/clipRail';
import type { Story, StoryGroup } from '@/lib/social';

function story(partial: Partial<Story> & { id: string; user_id: string }): Story {
  return {
    media_url: 'https://blob.mobi/w.mp4',
    media_type: 'video',
    challenge_id: null,
    caption: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    created_at: new Date().toISOString(),
    ...partial,
  } as Story;
}

function group(userId: string, stories: Story[], isOwn = false): StoryGroup {
  return { userId, name: userId, avatar: null, isOwn, stories };
}

describe('clip rail', () => {
  it('sorts Waves newest first', () => {
    const older = story({ id: 'a', user_id: 'u', created_at: '2026-01-01T00:00:00.000Z' });
    const newer = story({ id: 'b', user_id: 'u', created_at: '2026-01-02T00:00:00.000Z' });
    expect(newestFirstStories([older, newer]).map((row) => row.id)).toEqual(['b', 'a']);
  });

  it('starts the stack on the tapped Wave, then that person, then unseen friends', () => {
    const mine = [
      story({ id: 'old', user_id: 'p1', created_at: '2026-01-01T00:00:00.000Z' }),
      story({ id: 'tap', user_id: 'p1', created_at: '2026-01-02T00:00:00.000Z' }),
    ];
    const friendSeen = story({ id: 'seen', user_id: 'p2', created_at: '2026-01-03T00:00:00.000Z' });
    const friendUnseen = story({ id: 'unseen', user_id: 'p2', created_at: '2026-01-04T00:00:00.000Z' });
    const stack = buildWaveStack({
      groups: [group('p1', mine), group('p2', [friendSeen, friendUnseen])],
      startStoryId: 'tap',
      viewedIds: new Set(['seen']),
    });
    expect(stack.map((row) => row.id)).toEqual(['tap', 'old', 'unseen']);
  });

  it('hides rail Waves that are hidden, corporate, or author-muted', () => {
    const visible = story({ id: 'ok', user_id: 'a', post_id: 'p1' });
    const hidden = story({ id: 'hid', user_id: 'a', post_id: 'p2' });
    const corp = story({ id: 'corp', user_id: 'b', challenge_id: 'c1', post_id: 'p3' });
    const muted = story({ id: 'mut', user_id: 'z', post_id: 'p4' });
    const kept = filterStoriesForRail({
      stories: [visible, hidden, corp, muted],
      hiddenPostIds: new Set(['p2']),
      corporateChallengeIds: new Set(['c1']),
      hiddenAuthorIds: new Set(['z']),
    });
    expect(kept.map((row) => row.id)).toEqual(['ok']);
  });

  it('starts the Round stack on the tapped clip', () => {
    expect(buildRoundStack([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 'b').map((row) => row.id)).toEqual([
      'b',
      'a',
      'c',
    ]);
  });

  it('treats an empty Waves rail as hidden', () => {
    expect(railHasVisibleWaves([group('me', [], true)])).toBe(false);
    expect(railHasVisibleWaves([group('me', [story({ id: 'w', user_id: 'me' })], true)])).toBe(true);
  });
});
