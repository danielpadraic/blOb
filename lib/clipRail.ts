import { homeFeedAllowsChallengeContent } from '@/lib/privacyMode';
import { supabase } from '@/lib/supabase';
import type { StoryGroup } from '@/lib/social';
import type { Story } from '@/types/social';
import { authStorage } from '@/lib/utils/secureStore';

const HIDDEN_RAIL_AUTHORS_KEY = 'blob.hidden-rail-authors';

export async function fetchCorporateChallengeIds(ids: string[]): Promise<Set<string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) {
    return new Set();
  }
  const { data, error } = await supabase.from('challenges').select('id, privacy_mode').in('id', unique);
  if (error) {
    return new Set();
  }
  return new Set(
    (data ?? [])
      .filter((row) => !homeFeedAllowsChallengeContent(row.privacy_mode))
      .map((row) => row.id),
  );
}

export async function fetchHiddenRailPostIds(postIds: string[]): Promise<Set<string>> {
  const unique = [...new Set(postIds.filter(Boolean))];
  if (unique.length === 0) {
    return new Set();
  }
  const { data, error } = await supabase.from('posts').select('id, hidden_from_rail').in('id', unique);
  if (error) {
    return new Set();
  }
  return new Set((data ?? []).filter((row) => row.hidden_from_rail).map((row) => row.id));
}

export async function setPostHiddenFromRail(postId: string, hidden: boolean): Promise<void> {
  const { error } = await supabase.from('posts').update({ hidden_from_rail: hidden }).eq('id', postId);
  if (error) {
    throw error;
  }
}

export async function loadHiddenRailAuthors(): Promise<Set<string>> {
  try {
    const raw = await authStorage.getItem(HIDDEN_RAIL_AUTHORS_KEY);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(parsed.filter(Boolean));
  } catch {
    return new Set();
  }
}

export async function hideAuthorFromMyRail(authorId: string): Promise<Set<string>> {
  const next = await loadHiddenRailAuthors();
  next.add(authorId);
  await authStorage.setItem(HIDDEN_RAIL_AUTHORS_KEY, JSON.stringify([...next]));
  return next;
}

export function newestFirstStories<T extends { created_at: string }>(stories: T[]): T[] {
  return [...stories].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
}

export function filterStoriesForRail(input: {
  stories: Story[];
  hiddenPostIds: Set<string>;
  corporateChallengeIds: Set<string>;
  hiddenAuthorIds: Set<string>;
}): Story[] {
  return input.stories.filter((story) => {
    if (story.post_id && input.hiddenPostIds.has(story.post_id)) {
      return false;
    }
    if (story.challenge_id && input.corporateChallengeIds.has(story.challenge_id)) {
      return false;
    }
    if (input.hiddenAuthorIds.has(story.user_id)) {
      return false;
    }
    return true;
  });
}

export function railHasVisibleWaves(groups: StoryGroup[]): boolean {
  return groups.some((group) => group.stories.length > 0);
}

export type AuthorRange = {
  authorId: string;
  start: number;
  end: number;
};

/** Own stack first (rail order), then friends. Stories inside an author stay oldest-first. */
export function flattenWaveStories(input: {
  groups: StoryGroup[];
  startStoryId: string;
  extra?: Story | null;
}): { stories: Story[]; startIndex: number } {
  const startId = String(input.startStoryId ?? '').trim();
  const stories = input.groups.flatMap((group) => group.stories);
  const startIndex = stories.findIndex((story) => story.id === startId);
  if (startIndex >= 0) {
    return { stories, startIndex };
  }
  const extra = input.extra && extraMatchesStart(input.extra, startId) ? input.extra : null;
  if (!extra) {
    return { stories, startIndex: 0 };
  }
  if (stories.length === 0) {
    return { stories: [extra], startIndex: 0 };
  }
  const insertAt = insertIndexForAuthor(stories, extra);
  return {
    stories: [...stories.slice(0, insertAt), extra, ...stories.slice(insertAt)],
    startIndex: insertAt,
  };
}

function extraMatchesStart(story: Story, startId: string): boolean {
  return story.id === startId;
}

function insertIndexForAuthor(stories: Story[], extra: Story): number {
  const first = stories.findIndex((story) => story.user_id === extra.user_id);
  if (first < 0) {
    return stories.length;
  }
  let i = first;
  while (i < stories.length && stories[i]?.user_id === extra.user_id) {
    const time = Date.parse(stories[i]!.created_at) - Date.parse(extra.created_at);
    if (time > 0 || (time === 0 && (stories[i]!.sequence_index ?? 0) > (extra.sequence_index ?? 0))) {
      break;
    }
    i += 1;
  }
  return i;
}

/** @deprecated Use flattenWaveStories. Kept for older call sites. */
export function buildWaveStack(input: {
  groups: StoryGroup[];
  startStoryId: string;
  viewedIds: Set<string>;
}): Story[] {
  return flattenWaveStories(input).stories;
}

export function authorRanges(clips: { authorId: string }[]): AuthorRange[] {
  const ranges: AuthorRange[] = [];
  for (let i = 0; i < clips.length; i += 1) {
    const authorId = clips[i]?.authorId ?? '';
    const last = ranges[ranges.length - 1];
    if (last && last.authorId === authorId) {
      last.end = i;
    } else {
      ranges.push({ authorId, start: i, end: i });
    }
  }
  return ranges;
}

export function rangeAt(ranges: AuthorRange[], index: number): AuthorRange | null {
  return ranges.find((range) => index >= range.start && index <= range.end) ?? null;
}

/** Unseen clip in this author, else the newest (last in oldest-first). */
export function authorEntryIndex(
  clips: { id: string }[],
  range: AuthorRange,
  viewedIds: Set<string>,
): number {
  for (let i = range.start; i <= range.end; i += 1) {
    if (!viewedIds.has(clips[i]?.id ?? '')) {
      return i;
    }
  }
  return range.end;
}

export function nextStoryIndex(ranges: AuthorRange[], index: number): number | 'close' {
  const range = rangeAt(ranges, index);
  if (!range) {
    return 'close';
  }
  if (index < range.end) {
    return index + 1;
  }
  const next = ranges[ranges.indexOf(range) + 1];
  return next ? next.start : 'close';
}

export function prevStoryIndex(ranges: AuthorRange[], index: number): number | 'close' {
  const range = rangeAt(ranges, index);
  if (!range) {
    return 'close';
  }
  if (index > range.start) {
    return index - 1;
  }
  const prev = ranges[ranges.indexOf(range) - 1];
  return prev ? prev.end : 'close';
}

export function nextAuthorEntryIndex(
  clips: { id: string }[],
  ranges: AuthorRange[],
  index: number,
  viewedIds: Set<string>,
): number | null {
  const range = rangeAt(ranges, index);
  if (!range) {
    return null;
  }
  const next = ranges[ranges.indexOf(range) + 1];
  return next ? authorEntryIndex(clips, next, viewedIds) : null;
}

export function prevAuthorEntryIndex(
  clips: { id: string }[],
  ranges: AuthorRange[],
  index: number,
  viewedIds: Set<string>,
): number | null {
  const range = rangeAt(ranges, index);
  if (!range) {
    return null;
  }
  const prev = ranges[ranges.indexOf(range) - 1];
  return prev ? authorEntryIndex(clips, prev, viewedIds) : null;
}

export function preloadStoryIndex(ranges: AuthorRange[], index: number): number | null {
  const next = nextStoryIndex(ranges, index);
  return typeof next === 'number' ? next : null;
}

/** Home Rounds rail order (newest first). Play starts on the tapped id. */
export function buildRoundPlayList<T extends { id: string }>(
  rail: T[],
  startReelId: string,
  extra?: T | null,
): { items: T[]; startIndex: number } {
  const startId = String(startReelId ?? '').trim();
  const items = [...rail];
  if (extra && !items.some((row) => row.id === extra.id)) {
    items.unshift(extra);
  }
  const found = items.findIndex((row) => row.id === startId);
  if (found >= 0) {
    return { items, startIndex: found };
  }
  return { items: extra ? [extra] : items, startIndex: 0 };
}

/** @deprecated Use buildRoundPlayList. */
export function buildRoundStack<T extends { id: string }>(reels: T[], startReelId: string): T[] {
  return buildRoundPlayList(reels, startReelId).items;
}
