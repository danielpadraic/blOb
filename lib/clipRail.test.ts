import { describe, expect, it } from 'vitest';

import {
  authorEntryIndex,
  authorRanges,
  buildRoundPlayList,
  filterStoriesForRail,
  flattenWaveStories,
  newestFirstStories,
  nextAuthorEntryIndex,
  nextStoryIndex,
  prevAuthorEntryIndex,
  prevStoryIndex,
  railHasVisibleWaves,
} from '@/lib/clipRail';
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

  it('keeps each author’s Waves together and opens on the tapped id', () => {
    const mine = [
      story({ id: 'old', user_id: 'p1', created_at: '2026-01-01T00:00:00.000Z' }),
      story({ id: 'tap', user_id: 'p1', created_at: '2026-01-02T00:00:00.000Z' }),
    ];
    const friend = [
      story({ id: 'f1', user_id: 'p2', created_at: '2026-01-03T00:00:00.000Z' }),
      story({ id: 'f2', user_id: 'p2', created_at: '2026-01-04T00:00:00.000Z' }),
    ];
    const flat = flattenWaveStories({
      groups: [group('p1', mine, true), group('p2', friend)],
      startStoryId: 'tap',
    });
    expect(flat.stories.map((row) => row.id)).toEqual(['old', 'tap', 'f1', 'f2']);
    expect(flat.startIndex).toBe(1);
    const ranges = authorRanges([
      { authorId: 'p1' },
      { authorId: 'p1' },
      { authorId: 'p2' },
      { authorId: 'p2' },
    ]);
    expect(authorEntryIndex([{ id: 'old' }, { id: 'tap' }, { id: 'f1' }, { id: 'f2' }], ranges[1]!, new Set(['f1']))).toBe(
      3,
    );
    expect(nextStoryIndex(ranges, 0)).toBe(1);
    expect(nextStoryIndex(ranges, 1)).toBe(2);
    expect(nextStoryIndex(ranges, 3)).toBe('close');
    expect(prevStoryIndex(ranges, 0)).toBe('close');
    expect(prevStoryIndex(ranges, 2)).toBe(1);
    expect(nextAuthorEntryIndex([{ id: 'old' }, { id: 'tap' }, { id: 'f1' }, { id: 'f2' }], ranges, 1, new Set())).toBe(2);
    expect(prevAuthorEntryIndex([{ id: 'old' }, { id: 'tap' }, { id: 'f1' }, { id: 'f2' }], ranges, 2, new Set())).toBe(0);
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

  it('hides a hidden-from-rail Wave only on the owner’s rail', () => {
    const hiddenOwn = story({ id: 'hid', user_id: 'me', post_id: 'p2' });
    const hiddenFriend = story({ id: 'pal', user_id: 'pal', post_id: 'p2' });
    const kept = filterStoriesForRail({
      stories: [hiddenOwn, hiddenFriend],
      hiddenPostIds: new Set(['p2']),
      corporateChallengeIds: new Set(),
      hiddenAuthorIds: new Set(),
      viewerId: 'me',
    });
    expect(kept.map((row) => row.id)).toEqual(['pal']);
  });

  it('does not read .id on missing Wave rows and waits for the route clip', () => {
    const extra = story({ id: 'new', user_id: 'p1', created_at: '2026-01-05T00:00:00.000Z' });
    const groups = [group('p1', [undefined as unknown as Story, extra], true)];
    const waiting = flattenWaveStories({
      groups: [group('p2', [story({ id: 'other', user_id: 'p2' })])],
      startStoryId: 'new',
    });
    expect(waiting.stories).toEqual([]);
    const solo = flattenWaveStories({
      groups: [group('p2', [story({ id: 'other', user_id: 'p2' })])],
      startStoryId: 'new',
      extra,
    });
    expect(solo.stories.map((row) => row.id)).toEqual(['other', 'new']);
    expect(solo.startIndex).toBe(1);
    expect(flattenWaveStories({ groups, startStoryId: 'new' }).stories.map((row) => row.id)).toEqual(['new']);
  });

  it('plays Rounds in rail order and starts on the tapped clip', () => {
    const play = buildRoundPlayList([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 'b');
    expect(play.items.map((row) => row.id)).toEqual(['a', 'b', 'c']);
    expect(play.startIndex).toBe(1);
  });

  it('treats an empty Waves rail as hidden', () => {
    expect(railHasVisibleWaves([group('me', [], true)])).toBe(false);
    expect(railHasVisibleWaves([group('me', [story({ id: 'w', user_id: 'me' })], true)])).toBe(true);
  });
});
