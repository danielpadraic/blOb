import { homeFeedAllowsChallengeContent } from '@/lib/privacyMode';
import { supabase } from '@/lib/supabase';
import type { Story, StoryGroup } from '@/lib/social';
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

/** Tapped Wave first, then that person’s unhidden Waves newest-first, then friends’ unseen. */
export function buildWaveStack(input: {
  groups: StoryGroup[];
  startStoryId: string;
  viewedIds: Set<string>;
}): Story[] {
  const startId = String(input.startStoryId ?? '').trim();
  const startGroup = input.groups.find((group) => group.stories.some((story) => story.id === startId));
  if (!startGroup) {
    const solo = input.groups.flatMap((group) => group.stories).find((story) => story.id === startId);
    return solo ? [solo] : [];
  }
  const person = newestFirstStories(startGroup.stories);
  const startIndex = person.findIndex((story) => story.id === startId);
  const ordered =
    startIndex >= 0 ? [...person.slice(startIndex), ...person.slice(0, startIndex)] : person;
  const seen = new Set(ordered.map((story) => story.id));
  const unseenFriends = input.groups
    .filter((group) => group.userId !== startGroup.userId && !group.isOwn)
    .flatMap((group) => newestFirstStories(group.stories))
    .filter((story) => !input.viewedIds.has(story.id) && !seen.has(story.id));
  return [...ordered, ...unseenFriends];
}
