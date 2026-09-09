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

function findOldestIndexByCheckinId(list: Array<{ id?: string; checkin_id?: string | null; created_at?: string | null }>, checkinId: string): number {
  let oldestIndex = -1;
  for (let index = 0; index < list.length; index += 1) {
    const post = list[index];
    if (!post || String(post.checkin_id ?? '') !== checkinId) {
      continue;
    }
    if (oldestIndex < 0 || isOlderPost(post, list[oldestIndex]!)) {
      oldestIndex = index;
    }
  }
  return oldestIndex;
}

/**
 * One Live / Home row per checkin_id. Keep the oldest id, union media, keep the richest chips.
 * Empty-media extras that share a check-in with a still are dropped after the merge.
 */
export function dedupeLivePostsByCheckinId<T extends { id: string }>(posts: T[]): T[] {
  if (!Array.isArray(posts) || posts.length < 2) {
    return posts;
  }
  const active = posts.filter((post) => post && post.id && !(post as FeedPostRow).deleted_at);
  const groups = new Map<string, T[]>();
  for (const post of active) {
    const checkinId = String((post as FeedPostRow).checkin_id ?? '').trim();
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
    const checkinId = String((post as FeedPostRow).checkin_id ?? '').trim();
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
}

/** Patch one Live row. Unchanged posts keep the same object so the list does not remount. */
export function patchLiveFeedList(current: unknown, payload: LiveFeedRealtimePayload): unknown {
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
    return dedupeLivePostsByCheckinId(removed);
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
    const finished = dedupeLivePostsByCheckinId(changed ? patched : current);
    return sameItemList(current, finished) ? current : finished;
  }
  const checkinId = String(next?.checkin_id ?? '').trim();
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
      const finished = dedupeLivePostsByCheckinId(changed ? patched : current);
      return sameItemList(current, finished) ? current : finished;
    }
  }
  if (event === 'INSERT' || !event) {
    return dedupeLivePostsByCheckinId([...current, next]);
  }
  return current;
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
  queryClient.setQueriesData({ queryKey: ['feed', challengeId] }, (current) => {
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
  queryClient.setQueriesData({ queryKey: ['feed'] }, (current) => {
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
