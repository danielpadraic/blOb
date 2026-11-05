import type { QueryClient } from '@tanstack/react-query';

import { mediaUrlKey } from '@/lib/challengeProofs';
import { isWorkoutCardStoragePath } from '@/lib/health/postWorkoutCard';
import { mediaWithExtraCard } from '@/lib/health/workoutCardSlide';
import {
  isFreshOptimisticReactionKey,
  mergeReactionListsByKey,
  reactionSetKeyFromRow,
  upsertReactionInList,
} from '@/lib/reactions';
import type { Reaction } from '@/lib/types';

type FeedPostRow = {
  id?: string;
  author_id?: string | null;
  author?: { display_name?: string | null; username?: string | null; avatar_url?: string | null; id?: string | null } | null;
  checkin_id?: string | null;
  created_at?: string | null;
  deleted_at?: string | null;
  content?: string | null;
  media_urls?: unknown;
  media_captions?: unknown;
  hidden_media_urls?: unknown;
  checkin_stats?: unknown;
  hidden_from_home?: boolean | null;
  edited_at?: string | null;
  lift_session_id?: string | null;
  lift_snapshot?: unknown;
  comments?: unknown;
  reactions?: unknown;
};

export type LiveFeedPostRow = FeedPostRow;

export type LiveFeedRealtimePayload = {
  eventType?: string;
  new?: FeedPostRow | null;
  old?: FeedPostRow | null;
};

type LiveResetLog = {
  reason: string;
  postId?: string | null;
  checkinId?: string | null;
  mediaCount?: number;
  y?: number;
};

const loggedLiveResets = new Set<string>();

/** One line per unexpected Live reset. Same shape on iOS, Android, and Web. */
export function logUnexpectedLiveReset(payload: LiveResetLog): void {
  const key = `${payload.reason}:${payload.postId ?? ''}:${payload.checkinId ?? ''}`;
  if (loggedLiveResets.has(key)) {
    return;
  }
  loggedLiveResets.add(key);
  console.log('[blob:live]', {
    reason: payload.reason,
    postId: payload.postId ?? null,
    checkinId: payload.checkinId ?? null,
    mediaCount: payload.mediaCount ?? 0,
    y: payload.y ?? 0,
  });
}

export function resetLiveResetLogsForTests(): void {
  loggedLiveResets.clear();
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Dedupe only real check-in ids. Lobby chat has no checkin_id and must stay its own row. */
export function liveCheckinKey(value: unknown): string {
  const id = String(value ?? '').trim();
  return UUID_RE.test(id) ? id : '';
}

function asUrlList(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function sameJson(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function sameUrlList(left: unknown, right: string[]): boolean {
  return Array.isArray(left) && left.length === right.length && left.every((item, i) => item === right[i]);
}

function unionUrlList(left: unknown, right: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const url of [...(asUrlList(left) ?? []), ...(asUrlList(right) ?? [])]) {
    const next = url.trim();
    if (!next) {
      continue;
    }
    const key = mediaUrlKey(next);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(next);
  }
  return out;
}

function unionById<T extends { id?: string | null }>(left: unknown, right: unknown): T[] {
  const out: T[] = [];
  const seen = new Set<string>();
  for (const item of [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])] as T[]) {
    const id = String(item?.id ?? '').trim();
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push(item);
  }
  return out;
}

function statsRichness(stats: unknown): number {
  if (!stats || typeof stats !== 'object') {
    return 0;
  }
  const row = stats as Record<string, unknown>;
  const keys = ['duration_sec', 'active_cal', 'total_cal', 'hr_avg', 'hr_min', 'hr_max', 'distance_m', 'activity_label'];
  let score = 0;
  for (const key of keys) {
    const value = row[key];
    if (value == null || value === '') {
      continue;
    }
    if (typeof value === 'number' && !(Number.isFinite(value) && value > 0) && key !== 'activity_label') {
      continue;
    }
    score += 1;
  }
  if (typeof row.card_url === 'string' && row.card_url.trim()) {
    score += 2;
  }
  if (Array.isArray(row.hr_series) && row.hr_series.length > 0) {
    score += 1;
  }
  if (Array.isArray(row.honor_fields) && row.honor_fields.length > 0) {
    score += row.honor_fields.length;
  }
  if (String(row.source ?? '').trim() === 'honor_card') {
    score += 2;
  }
  return score;
}

/** Prefer the payload that can actually draw chips. Ties keep the oldest row's stats. */
export function richestCheckinStats(left: unknown, right: unknown): unknown {
  const leftScore = statsRichness(left);
  const rightScore = statsRichness(right);
  if (rightScore > leftScore) {
    return right;
  }
  if (leftScore > 0) {
    return left;
  }
  return right ?? left ?? null;
}

function createdAtMs(post: { created_at?: string | null }): number {
  const at = Date.parse(String(post.created_at ?? ''));
  return Number.isFinite(at) ? at : Number.POSITIVE_INFINITY;
}

function isOlderPost(left: { id?: string; created_at?: string | null }, right: { id?: string; created_at?: string | null }): boolean {
  const leftAt = createdAtMs(left);
  const rightAt = createdAtMs(right);
  if (leftAt !== rightAt) {
    return leftAt < rightAt;
  }
  return String(left.id ?? '') < String(right.id ?? '');
}

function mergeLiveFeedPost<T extends { id: string }>(post: T, row: FeedPostRow): T {
  const media = asUrlList(row.media_urls);
  const hidden = asUrlList(row.hidden_media_urls);
  const captions = Array.isArray(row.media_captions) ? row.media_captions : null;
  let next: T = post;
  const assign = (key: string, value: unknown, equal: boolean) => {
    if (equal) {
      return;
    }
    next = next === post ? { ...post } : next;
    (next as Record<string, unknown>)[key] = value;
  };
  if (row.content !== undefined) {
    const existing = String((post as FeedPostRow).content ?? '').trim();
    const incoming = String(row.content ?? '').trim();
    // An empty "Check-in Complete" duplicate must not wipe a real caption.
    if (!(incoming === '' && existing !== '')) {
      assign('content', row.content, (post as FeedPostRow).content === row.content);
    }
  }
  if (media) {
    const existingMedia = asUrlList((post as FeedPostRow).media_urls) ?? [];
    const incomingCard = media.find((url) => isWorkoutCardStoragePath(url));
    const unioned = unionUrlList(existingMedia, media);
    // One recap card, always the last slide: a redrawn card replaces the one on screen instead of
    // stacking beside it, and the stills in front of it keep their places.
    const merged = incomingCard ? mediaWithExtraCard(unioned, incomingCard) : unioned;
    // A stats / card write must never blank stills that are already on screen.
    if (!(media.length === 0 && existingMedia.length > 0)) {
      assign('media_urls', merged, sameUrlList((post as FeedPostRow).media_urls, merged));
    }
  }
  if (hidden) {
    assign('hidden_media_urls', hidden, sameUrlList((post as FeedPostRow).hidden_media_urls, hidden));
  }
  if (captions) {
    assign('media_captions', captions, sameJson((post as FeedPostRow).media_captions, captions));
  }
  if (row.hidden_from_home !== undefined) {
    assign(
      'hidden_from_home',
      row.hidden_from_home,
      (post as FeedPostRow).hidden_from_home === row.hidden_from_home,
    );
  }
  if (row.checkin_stats !== undefined) {
    const picked = richestCheckinStats((post as FeedPostRow).checkin_stats, row.checkin_stats);
    assign('checkin_stats', picked, sameJson((post as FeedPostRow).checkin_stats, picked));
  }
  if (row.edited_at !== undefined) {
    assign('edited_at', row.edited_at, (post as FeedPostRow).edited_at === row.edited_at);
  }
  if (row.lift_session_id !== undefined) {
    assign('lift_session_id', row.lift_session_id, (post as FeedPostRow).lift_session_id === row.lift_session_id);
  }
  if (row.lift_snapshot !== undefined) {
    assign('lift_snapshot', row.lift_snapshot, sameJson((post as FeedPostRow).lift_snapshot, row.lift_snapshot));
  }
  if (row.checkin_id && !(post as FeedPostRow).checkin_id) {
    assign('checkin_id', row.checkin_id, false);
  }
  if (row.author_id && !(post as FeedPostRow).author_id) {
    assign('author_id', row.author_id, false);
  }
  if (row.author) {
    const existing = (post as FeedPostRow).author;
    const incomingName = String(row.author.display_name ?? row.author.username ?? '').trim();
    const existingName = String(existing?.display_name ?? existing?.username ?? '').trim();
    const incomingReal = incomingName && incomingName !== 'Member' && incomingName !== 'Someone';
    const existingStub = !existingName || existingName === 'Member' || existingName === 'Someone';
    if (incomingReal && existingStub) {
      assign('author', row.author, false);
    }
  }
  if (Array.isArray(row.comments) && row.comments.length > 0) {
    const merged = unionById((post as FeedPostRow).comments, row.comments);
    assign('comments', merged, sameJson((post as FeedPostRow).comments, merged));
  }
  if (Array.isArray(row.reactions) && row.reactions.length > 0) {
    const merged = mergeReactionListsByKey((post as FeedPostRow).reactions, row.reactions);
    assign('reactions', merged, sameJson((post as FeedPostRow).reactions, merged));
  }
  return next;
}

function mergeCheckinDuplicate<T extends { id: string }>(oldest: T, extra: T): T {
  return mergeLiveFeedPost(oldest, extra as FeedPostRow);
}

function sameItemList(prev: unknown[], next: unknown[]): boolean {
  return prev.length === next.length && prev.every((item, index) => item === next[index]);
}

export function isOptimisticLiveId(id?: string | null): boolean {
  return String(id ?? '').startsWith('optimistic-');
}

/** Device and server clocks drift, so time only breaks ties and guards bare repeats. */
const OPTIMISTIC_MATCH_MS = 5000;
const OPTIMISTIC_TEXT_MATCH_MS = 120_000;

type OptimisticProbe = {
  id?: string | null;
  client_temp_id?: string | null;
  author_id?: string | null;
  content?: string | null;
  media_urls?: unknown;
  created_at?: string | null;
};

function bodyKey(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function mediaKeySet(value: unknown): Set<string> {
  const keys = new Set<string>();
  for (const url of asUrlList(value) ?? []) {
    const key = mediaUrlKey(url);
    if (key) {
      keys.add(key);
    }
  }
  return keys;
}

/**
 * Which optimistic row is this server row? In order: a client temp id the row carries, a shared
 * photo, then the same words. Content alone never decides a photo send, and a bare repeat
 * ("ok", "ok") only matches inside a few seconds. The closest created_at wins among candidates.
 */
export function matchOptimisticLiveIndex(
  list: ReadonlyArray<OptimisticProbe>,
  incoming: OptimisticProbe,
): number {
  const author = String(incoming.author_id ?? '').trim();
  if (!author) {
    return -1;
  }
  const tempId = String(incoming.client_temp_id ?? '').trim();
  if (tempId) {
    const byTemp = list.findIndex(
      (row) => isOptimisticLiveId(row.id) && (row.id === tempId || row.client_temp_id === tempId),
    );
    if (byTemp >= 0) {
      return byTemp;
    }
  }
  const body = bodyKey(incoming.content);
  const media = mediaKeySet(incoming.media_urls);
  const at = Date.parse(String(incoming.created_at ?? ''));
  let best = -1;
  let bestGap = Number.POSITIVE_INFINITY;
  list.forEach((row, index) => {
    if (!isOptimisticLiveId(row.id) || String(row.author_id ?? '').trim() !== author) {
      return;
    }
    const rowAt = Date.parse(String(row.created_at ?? ''));
    const gap = Number.isFinite(at) && Number.isFinite(rowAt) ? Math.abs(rowAt - at) : 0;
    const rowMedia = mediaKeySet(row.media_urls);
    let hit = false;
    if (media.size > 0 && rowMedia.size > 0) {
      hit = [...media].some((key) => rowMedia.has(key));
    } else if (media.size === 0 && rowMedia.size === 0) {
      const rowBody = bodyKey(row.content);
      hit = rowBody === body && gap <= (body ? OPTIMISTIC_TEXT_MATCH_MS : OPTIMISTIC_MATCH_MS);
    } else {
      // One side has a photo and the other does not: the same words are a different send.
      hit = false;
    }
    if (hit && gap < bestGap) {
      best = index;
      bestGap = gap;
    }
  });
  return best;
}

/** True when this INSERT would add a new row, so the caller should hydrate it first. */
export function liveInsertWouldAppend(current: unknown, row?: FeedPostRow | null): boolean {
  if (!Array.isArray(current) || !row?.id || row.deleted_at) {
    return false;
  }
  if (current.some((post) => post && post.id === row.id)) {
    return false;
  }
  const checkinId = liveCheckinKey(row.checkin_id);
  if (checkinId && findOldestIndexByCheckinId(current, checkinId) >= 0) {
    return false;
  }
  return matchOptimisticLiveIndex(current, row) < 0;
}

/** A neutral name for a person we could not look up. Never another person's name. */
export function stubLiveAuthor(authorId?: string | null): NonNullable<FeedPostRow['author']> | undefined {
  const id = String(authorId ?? '').trim();
  return id ? { id, display_name: 'Member' } : undefined;
}

/** One row per posts.id. First write wins so a refetch cannot reprint the bubble. */
export function uniqueLivePostsById<T extends { id?: string | null }>(posts: readonly T[]): T[] {
  const seen = new Map<string, T>();
  for (const post of posts) {
    const id = String(post?.id ?? '').trim();
    if (!id) {
      continue;
    }
    if (!seen.has(id)) {
      seen.set(id, post);
    }
  }
  return [...seen.values()];
}

function withLiveInsertDefaults<T extends FeedPostRow>(row: T): T {
  const author = row.author ?? stubLiveAuthor(row.author_id);
  return {
    ...row,
    ...(author ? { author } : {}),
    comments: Array.isArray(row.comments) ? row.comments : [],
    reactions: Array.isArray(row.reactions) ? row.reactions : [],
  };
}

function finishLiveList<T extends { id: string }>(list: T[]): T[] {
  return dedupeLivePostsByCheckinId(uniqueLivePostsById(list));
}

/**
 * A refetch / hydrate snapshot patches the list already on screen.
 * Same posts.id (or checkin_id) keeps the same object. New rows append.
 */
export function mergeLiveFeedSnapshot<T extends { id: string }>(
  previous: T[] | undefined,
  incoming: T[],
): T[] {
  const next = finishLiveList(incoming);
  if (!previous?.length) {
    return next;
  }
  let current = previous;
  for (const row of next) {
    const patched = patchLiveFeedList(current, { eventType: 'INSERT', new: row as FeedPostRow });
    current = Array.isArray(patched) ? (patched as T[]) : current;
  }
  return finishLiveList(current);
}

/**
 * Replace an optimistic row (or an existing posts.id) instead of appending a twin.
 * New lobby lines append at the end — Live is oldest-first.
 */
export function upsertLiveFeedPost<T extends { id: string }>(
  current: unknown,
  post: T,
  optimisticId?: string | null,
): T[] {
  const list = Array.isArray(current) ? (current as T[]) : [];
  const id = String(post?.id ?? '').trim();
  if (!id) {
    return list;
  }
  const skip = new Set([id, String(optimisticId ?? '').trim()].filter(Boolean));
  const next = list.filter((row) => !skip.has(String(row?.id ?? '')));
  return finishLiveList([...next, post]);
}

function findOldestIndexByCheckinId(list: Array<{ id?: string; checkin_id?: string | null; created_at?: string | null }>, checkinId: string): number {
  const key = liveCheckinKey(checkinId);
  if (!key) {
    return -1;
  }
  let oldestIndex = -1;
  for (let index = 0; index < list.length; index += 1) {
    const post = list[index];
    if (!post || liveCheckinKey(post.checkin_id) !== key) {
      continue;
    }
    if (oldestIndex < 0 || isOlderPost(post, list[oldestIndex]!)) {
      oldestIndex = index;
    }
  }
  return oldestIndex;
}

function logMergeFail(reason: string, error: unknown, extra?: Record<string, unknown>): void {
  const err = error instanceof Error ? error : null;
  console.log('[blob:live]', {
    reason,
    message: err?.message?.trim() || String(error ?? 'merge failed'),
    stack: err?.stack ?? null,
    ...extra,
  });
}

/**
 * One Live / Home row per checkin_id. Keep the oldest id, union media, keep the richest chips.
 * Empty-media extras that share a check-in with a still are dropped after the merge.
 */
export function dedupeLivePostsByCheckinId<T extends { id: string }>(posts: T[]): T[] {
  try {
    if (!Array.isArray(posts) || posts.length < 2) {
      return Array.isArray(posts) ? posts : [];
    }
    const active = posts.filter((post) => post && post.id && !(post as FeedPostRow).deleted_at);
    const groups = new Map<string, T[]>();
    for (const post of active) {
      const checkinId = liveCheckinKey((post as FeedPostRow).checkin_id);
      if (!checkinId) {
        continue;
      }
      const group = groups.get(checkinId) ?? [];
      group.push(post);
      groups.set(checkinId, group);
    }
    if ([...groups.values()].every((group) => group.length < 2)) {
      return posts;
    }
    const keeperByCheckin = new Map<string, T>();
    for (const [checkinId, group] of groups) {
      const ordered = [...group].sort((left, right) => (isOlderPost(left, right) ? -1 : 1));
      let keeper = ordered[0]!;
      for (const extra of ordered.slice(1)) {
        keeper = mergeCheckinDuplicate(keeper, extra);
      }
      keeperByCheckin.set(checkinId, keeper);
    }
    const used = new Set<string>();
    const next: T[] = [];
    for (const post of active) {
      const checkinId = liveCheckinKey((post as FeedPostRow).checkin_id);
      if (!checkinId) {
        next.push(post);
        continue;
      }
      if (used.has(checkinId)) {
        continue;
      }
      used.add(checkinId);
      next.push(keeperByCheckin.get(checkinId) ?? post);
    }
    return sameItemList(posts, next) ? posts : next;
  } catch (error) {
    logMergeFail('dedupe', error);
    return Array.isArray(posts) ? posts : [];
  }
}

/** Patch one Live row. Unchanged posts keep the same object so the list does not remount. */
export function patchLiveFeedList(current: unknown, payload: LiveFeedRealtimePayload): unknown {
  try {
    if (!Array.isArray(current)) {
      return current;
    }
    const event = String(payload.eventType ?? '').toUpperCase();
    const next = payload.new;
    const prev = payload.old;
    if (event === 'DELETE') {
      const id = String(prev?.id ?? next?.id ?? '');
      if (!id) {
        return current;
      }
      const removed = current.filter((post) => post && post.id !== id);
      return finishLiveList(removed);
    }
    const id = String(next?.id ?? '');
    if (!id) {
      return current;
    }
    const existingIndex = current.findIndex((post) => post && post.id === id);
    if (existingIndex >= 0) {
      let changed = false;
      const patched = current.map((post) => {
        if (!post || post.id !== id) {
          return post;
        }
        const merged = mergeLiveFeedPost(post, next ?? {});
        if (merged !== post) {
          changed = true;
        }
        return merged;
      });
      const finished = finishLiveList(changed ? patched : current);
      return sameItemList(current, finished) ? current : finished;
    }
    const checkinId = liveCheckinKey(next?.checkin_id);
    if (checkinId) {
      const oldestIndex = findOldestIndexByCheckinId(current, checkinId);
      if (oldestIndex >= 0) {
        let changed = false;
        const patched = current.map((post, index) => {
          if (index !== oldestIndex) {
            return post;
          }
          const merged = mergeLiveFeedPost(post, next ?? {});
          if (merged !== post) {
            changed = true;
          }
          return merged;
        });
        const finished = finishLiveList(changed ? patched : current);
        return sameItemList(current, finished) ? current : finished;
      }
    }
    if (event === 'INSERT' || !event) {
      const optimisticAt = matchOptimisticLiveIndex(current, next ?? {});
      if (optimisticAt >= 0) {
        const patched = current.map((post, index) =>
          index === optimisticAt ? mergeLiveFeedPost({ ...post, id }, next ?? {}) : post,
        );
        return finishLiveList(patched);
      }
      if (next?.deleted_at) {
        return current;
      }
      return finishLiveList([...current, withLiveInsertDefaults(next as FeedPostRow)]);
    }
    return current;
  } catch (error) {
    logMergeFail('patch', error, {
      postId: payload?.new?.id ?? payload?.old?.id ?? null,
      checkinId: payload?.new?.checkin_id ?? null,
    });
    return current;
  }
}

export function patchChallengeLiveFeed(
  queryClient: Pick<QueryClient, 'setQueriesData'>,
  challengeId: string,
  payload: LiveFeedRealtimePayload,
): boolean {
  const event = String(payload.eventType ?? '').toUpperCase();
  const id = String(payload.new?.id ?? payload.old?.id ?? '');
  const effective =
    event === 'INSERT' || event === 'UPDATE' || event === 'DELETE' ? event : id ? 'UPDATE' : '';
  if (!effective) {
    return false;
  }
  let sawList = false;
  queryClient.setQueriesData({ queryKey: ['live', challengeId] }, (current) => {
    if (!Array.isArray(current)) {
      return current;
    }
    sawList = true;
    return patchLiveFeedList(current, { ...payload, eventType: effective });
  });
  return sawList;
}

/** Merge stats / media onto an existing post in every feed cache, without refetching. */
export function patchFeedPostFields(
  queryClient: Pick<QueryClient, 'setQueriesData'>,
  postId: string,
  row: FeedPostRow,
): void {
  const id = String(postId ?? '').trim();
  if (!id) {
    return;
  }
  const payload: LiveFeedRealtimePayload = { eventType: 'UPDATE', new: { id, ...row } };
  for (const root of ['feed', 'live'] as const) {
  queryClient.setQueriesData({ queryKey: [root] }, (current) => {
    if (Array.isArray(current)) {
      return patchLiveFeedList(current, payload);
    }
    if (current && typeof current === 'object' && Array.isArray((current as { pages?: unknown }).pages)) {
      const data = current as { pages: Array<{ posts?: unknown }> };
      let changed = false;
      const pages = data.pages.map((page) => {
        if (!Array.isArray(page.posts)) {
          return page;
        }
        const next = patchLiveFeedList(page.posts, payload);
        if (next !== page.posts) {
          changed = true;
          return { ...page, posts: next };
        }
        return page;
      });
      return changed ? { ...data, pages } : current;
    }
    return current;
  });
  }
}

type LiveAuthor = NonNullable<FeedPostRow['author']>;

export type LiveCommentRow = {
  id?: string;
  post_id?: string | null;
  author_id?: string | null;
  parent_id?: string | null;
  content?: string | null;
  created_at?: string | null;
  edited_at?: string | null;
  deleted_at?: string | null;
};

export type LiveReactionRow = {
  id?: string;
  user_id?: string | null;
  post_id?: string | null;
  comment_id?: string | null;
  reaction_type?: string | null;
  created_at?: string | null;
};

export type LiveSocialPayload<Row> = {
  eventType?: string;
  new?: Row | null;
  old?: Row | null;
};

type LiveSocialPost = {
  id: string;
  author_id?: string | null;
  author?: LiveAuthor | null;
  comments?: Array<{
    id: string;
    post_id?: string | null;
    author_id?: string | null;
    author?: LiveAuthor | null;
    parent_id?: string | null;
    content?: string | null;
    created_at?: string | null;
    edited_at?: string | null;
    reactions?: Reaction[];
  }> | null;
  reactions?: Reaction[] | null;
};

function isStubAuthor(author?: LiveAuthor | null): boolean {
  const name = String(author?.display_name ?? author?.username ?? '').trim();
  return !name || name === 'Member' || name === 'Someone';
}

function knownAuthor(list: LiveSocialPost[], authorId: string): LiveAuthor | undefined {
  for (const post of list) {
    if (post?.author_id === authorId && post.author && !isStubAuthor(post.author)) {
      return post.author;
    }
    for (const comment of post?.comments ?? []) {
      if (comment?.author_id === authorId && comment.author && !isStubAuthor(comment.author)) {
        return comment.author;
      }
    }
  }
  return undefined;
}

/** Comment writes by someone else. Posts that are not in this list are left alone. */
export function patchLiveCommentList(
  current: unknown,
  payload: LiveSocialPayload<LiveCommentRow>,
): unknown {
  try {
    if (!Array.isArray(current)) {
      return current;
    }
    const list = current as LiveSocialPost[];
    const event = String(payload.eventType ?? '').toUpperCase();
    const row = payload.new ?? null;
    const removedId = String(payload.old?.id ?? row?.id ?? '').trim();

    if (event === 'DELETE' || (event === 'UPDATE' && row?.deleted_at)) {
      if (!removedId) {
        return current;
      }
      let changed = false;
      const next = list.map((post) => {
        if (!post?.comments?.some((comment) => comment.id === removedId)) {
          return post;
        }
        changed = true;
        return {
          ...post,
          comments: post.comments.filter(
            (comment) => comment.id !== removedId && comment.parent_id !== removedId,
          ),
        };
      });
      return changed ? next : current;
    }

    const id = String(row?.id ?? '').trim();
    const postId = String(row?.post_id ?? '').trim();
    if (!row || !id) {
      return current;
    }

    if (event === 'UPDATE') {
      let changed = false;
      const next = list.map((post) => {
        const at = post?.comments?.findIndex((comment) => comment.id === id) ?? -1;
        if (at < 0 || !post.comments) {
          return post;
        }
        const existing = post.comments[at]!;
        const content = row.content ?? existing.content;
        const edited = row.edited_at ?? existing.edited_at;
        if (content === existing.content && edited === existing.edited_at) {
          return post;
        }
        changed = true;
        const comments = post.comments.slice();
        comments[at] = { ...existing, content, edited_at: edited };
        return { ...post, comments };
      });
      return changed ? next : current;
    }

    if (!postId || row.deleted_at) {
      return current;
    }
    const postIndex = list.findIndex((post) => post?.id === postId);
    if (postIndex < 0) {
      return current;
    }
    const post = list[postIndex]!;
    const comments = post.comments ?? [];
    if (comments.some((comment) => comment.id === id)) {
      return current;
    }
    const optimisticAt = comments.findIndex(
      (comment) =>
        comment.id.startsWith('optimistic-comment-') &&
        String(comment.author_id ?? '') === String(row.author_id ?? '') &&
        bodyKey(comment.content) === bodyKey(row.content) &&
        (comment.parent_id ?? null) === (row.parent_id ?? null),
    );
    let nextComments: NonNullable<LiveSocialPost['comments']>;
    if (optimisticAt >= 0) {
      nextComments = comments.slice();
      nextComments[optimisticAt] = {
        ...comments[optimisticAt]!,
        id,
        parent_id: row.parent_id ?? null,
        created_at: row.created_at ?? comments[optimisticAt]!.created_at,
      };
    } else {
      const authorId = String(row.author_id ?? '').trim();
      const author = knownAuthor(list, authorId) ?? stubLiveAuthor(authorId);
      nextComments = [
        ...comments,
        {
          id,
          post_id: postId,
          author_id: row.author_id ?? null,
          parent_id: row.parent_id ?? null,
          content: row.content ?? '',
          created_at: row.created_at ?? new Date().toISOString(),
          edited_at: row.edited_at ?? null,
          ...(author ? { author } : {}),
          reactions: [],
        },
      ];
    }
    const next = list.slice();
    next[postIndex] = { ...post, comments: nextComments };
    return next;
  } catch (error) {
    logMergeFail('comment', error, { commentId: payload?.new?.id ?? payload?.old?.id ?? null });
    return current;
  }
}

/** Reaction writes by someone else, on a post or on one of its comments. */
export function patchLiveReactionList(
  current: unknown,
  payload: LiveSocialPayload<LiveReactionRow>,
  viewerId?: string | null,
): unknown {
  try {
    if (!Array.isArray(current)) {
      return current;
    }
    const list = current as LiveSocialPost[];
    const event = String(payload.eventType ?? '').toUpperCase();

    if (event === 'DELETE') {
      const removedId = String(payload.old?.id ?? '').trim();
      if (!removedId) {
        return current;
      }
      let changed = false;
      const next = list.map((post) => {
        let postChanged = false;
        let reactions = post?.reactions;
        if (reactions?.some((reaction) => reaction.id === removedId)) {
          reactions = reactions.filter((reaction) => reaction.id !== removedId);
          postChanged = true;
        }
        let comments = post?.comments;
        if (comments?.some((comment) => comment.reactions?.some((reaction) => reaction.id === removedId))) {
          comments = comments.map((comment) =>
            comment.reactions?.some((reaction) => reaction.id === removedId)
              ? { ...comment, reactions: comment.reactions.filter((reaction) => reaction.id !== removedId) }
              : comment,
          );
          postChanged = true;
        }
        if (!postChanged) {
          return post;
        }
        changed = true;
        return { ...post, reactions, comments };
      });
      return changed ? next : current;
    }

    const row = payload.new;
    const userId = String(row?.user_id ?? '').trim();
    const type = String(row?.reaction_type ?? '').trim();
    if (!row?.id || !userId || !type || (event !== 'INSERT' && event !== 'UPDATE')) {
      return current;
    }
    const reaction: Reaction = {
      id: row.id,
      user_id: userId,
      post_id: row.post_id ?? null,
      comment_id: row.comment_id ?? null,
      reaction_type: type as Reaction['reaction_type'],
      created_at: row.created_at ?? new Date().toISOString(),
    };
    // The viewer's own tap is already on screen. A late echo must not undo a fast un-tap.
    if (viewerId && userId === viewerId && isFreshOptimisticReactionKey(reactionSetKeyFromRow(reaction))) {
      return current;
    }
    const commentId = String(row.comment_id ?? '').trim();
    const postId = String(row.post_id ?? '').trim();
    let changed = false;
    const next = list.map((post) => {
      if (commentId) {
        if (!post?.comments?.some((comment) => comment.id === commentId)) {
          return post;
        }
        const comments = post.comments.map((comment) => {
          if (comment.id !== commentId) {
            return comment;
          }
          const merged = upsertReactionInList(comment.reactions ?? [], reaction);
          if (sameJson(merged, comment.reactions ?? [])) {
            return comment;
          }
          changed = true;
          return { ...comment, reactions: merged };
        });
        return changed ? { ...post, comments } : post;
      }
      if (!postId || post?.id !== postId) {
        return post;
      }
      const merged = upsertReactionInList(post.reactions ?? [], reaction);
      if (sameJson(merged, post.reactions ?? [])) {
        return post;
      }
      changed = true;
      return { ...post, reactions: merged };
    });
    return changed ? next : current;
  } catch (error) {
    logMergeFail('reaction', error, { reactionId: payload?.new?.id ?? payload?.old?.id ?? null });
    return current;
  }
}

/** Swap a stub name for the real profile on every comment and post by that person. */
export function patchLiveAuthorList(current: unknown, authorId: string, author: LiveAuthor): unknown {
  if (!Array.isArray(current) || !authorId || isStubAuthor(author)) {
    return current;
  }
  const list = current as LiveSocialPost[];
  let changed = false;
  const next = list.map((post) => {
    let postNext = post;
    if (post?.author_id === authorId && isStubAuthor(post.author)) {
      postNext = { ...postNext, author };
      changed = true;
    }
    if (post?.comments?.some((comment) => comment.author_id === authorId && isStubAuthor(comment.author))) {
      postNext = {
        ...postNext,
        comments: post.comments.map((comment) =>
          comment.author_id === authorId && isStubAuthor(comment.author) ? { ...comment, author } : comment,
        ),
      };
      changed = true;
    }
    return postNext;
  });
  return changed ? next : current;
}

type LiveCacheClient = Pick<QueryClient, 'setQueriesData'> &
  Partial<Pick<QueryClient, 'getQueriesData'>>;

function mapLiveLists(
  queryClient: Pick<QueryClient, 'setQueriesData'>,
  challengeId: string,
  update: (list: unknown) => unknown,
): boolean {
  let matched = false;
  queryClient.setQueriesData({ queryKey: ['live', challengeId] }, (current) => {
    if (!Array.isArray(current)) {
      return current;
    }
    const next = update(current);
    if (next !== current) {
      matched = true;
    }
    return next;
  });
  return matched;
}

export function patchChallengeLiveComment(
  queryClient: Pick<QueryClient, 'setQueriesData'>,
  challengeId: string,
  payload: LiveSocialPayload<LiveCommentRow>,
): boolean {
  return mapLiveLists(queryClient, challengeId, (list) => patchLiveCommentList(list, payload));
}

export function patchChallengeLiveReaction(
  queryClient: Pick<QueryClient, 'setQueriesData'>,
  challengeId: string,
  payload: LiveSocialPayload<LiveReactionRow>,
  viewerId?: string | null,
): boolean {
  return mapLiveLists(queryClient, challengeId, (list) => patchLiveReactionList(list, payload, viewerId));
}

export function patchChallengeLiveAuthor(
  queryClient: Pick<QueryClient, 'setQueriesData'>,
  challengeId: string,
  authorId: string,
  author: LiveAuthor,
): boolean {
  return mapLiveLists(queryClient, challengeId, (list) => patchLiveAuthorList(list, authorId, author));
}

/**
 * A realtime post INSERT paints with its author and social data. It fetches that one post
 * first; a failed fetch still shows the row, under a neutral name.
 */
export async function patchChallengeLiveInsert(
  queryClient: LiveCacheClient,
  challengeId: string,
  payload: LiveFeedRealtimePayload,
  fetchPost: (postId: string) => Promise<FeedPostRow | null>,
): Promise<boolean> {
  const row = payload.new;
  const event = String(payload.eventType ?? '').toUpperCase();
  const id = String(row?.id ?? '').trim();
  if (event !== 'INSERT' || !row || !id) {
    return patchChallengeLiveFeed(queryClient, challengeId, payload);
  }
  if (typeof queryClient.getQueriesData === 'function') {
    const lists = queryClient
      .getQueriesData<unknown>({ queryKey: ['live', challengeId] })
      .map(([, data]) => data)
      .filter(Array.isArray);
    if (lists.length > 0 && !lists.some((list) => liveInsertWouldAppend(list, row))) {
      return patchChallengeLiveFeed(queryClient, challengeId, payload);
    }
  }
  let hydrated: FeedPostRow | null = null;
  try {
    hydrated = await fetchPost(id);
  } catch (error) {
    logMergeFail('insert-fetch', error, { postId: id });
  }
  const usable = hydrated && hydrated.id === id && !hydrated.deleted_at ? hydrated : null;
  return patchChallengeLiveFeed(queryClient, challengeId, {
    eventType: 'INSERT',
    new: usable ? { ...row, ...usable } : row,
  });
}
