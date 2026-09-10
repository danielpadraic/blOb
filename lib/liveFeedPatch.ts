import type { QueryClient } from '@tanstack/react-query';

type FeedPostRow = {
  id?: string;
  author_id?: string | null;
  checkin_id?: string | null;
  created_at?: string | null;
  deleted_at?: string | null;
  content?: string | null;
  media_urls?: unknown;
  media_captions?: unknown;
  hidden_media_urls?: unknown;
  checkin_stats?: unknown;
  edited_at?: string | null;
  lift_session_id?: string | null;
  lift_snapshot?: unknown;
  comments?: unknown;
  reactions?: unknown;
};

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
    if (!next || seen.has(next)) {
      continue;
    }
    seen.add(next);
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
    const merged = unionUrlList(existingMedia, media);
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
  if (Array.isArray(row.comments) && row.comments.length > 0) {
    const merged = unionById((post as FeedPostRow).comments, row.comments);
    assign('comments', merged, sameJson((post as FeedPostRow).comments, merged));
  }
  if (Array.isArray(row.reactions) && row.reactions.length > 0) {
    const merged = unionById((post as FeedPostRow).reactions, row.reactions);
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

const OPTIMISTIC_MATCH_MS = 5000;

/** Same author + body + created_at ±5s. Used when realtime arrives before onSuccess swaps the id. */
export function matchOptimisticLiveIndex(
  list: ReadonlyArray<{
    id?: string | null;
    author_id?: string | null;
    content?: string | null;
    created_at?: string | null;
  }>,
  incoming: {
    author_id?: string | null;
    content?: string | null;
    created_at?: string | null;
  },
): number {
  const author = String(incoming.author_id ?? '').trim();
  const body = String(incoming.content ?? '').trim();
  const at = Date.parse(String(incoming.created_at ?? ''));
  if (!author || !Number.isFinite(at)) {
    return -1;
  }
  return list.findIndex((row) => {
    if (!isOptimisticLiveId(row.id)) {
      return false;
    }
    if (String(row.author_id ?? '').trim() !== author) {
      return false;
    }
    if (String(row.content ?? '').trim() !== body) {
      return false;
    }
    const rowAt = Date.parse(String(row.created_at ?? ''));
    return Number.isFinite(rowAt) && Math.abs(rowAt - at) <= OPTIMISTIC_MATCH_MS;
  });
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

function finishLiveList<T extends { id: string }>(list: T[]): T[] {
  return dedupeLivePostsByCheckinId(uniqueLivePostsById(list));
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
      return finishLiveList([...current, next]);
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
