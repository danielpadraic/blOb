import type { QueryClient } from '@tanstack/react-query';

type FeedPostRow = {
  id?: string;
  content?: string | null;
  media_urls?: unknown;
  media_captions?: unknown;
  hidden_media_urls?: unknown;
  checkin_stats?: unknown;
  edited_at?: string | null;
  lift_session_id?: string | null;
};

export type LiveFeedRealtimePayload = {
  eventType?: string;
  new?: FeedPostRow | null;
  old?: FeedPostRow | null;
};

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
    assign('content', row.content, (post as FeedPostRow).content === row.content);
  }
  if (media) {
    assign('media_urls', media, sameUrlList((post as FeedPostRow).media_urls, media));
  }
  if (hidden) {
    assign('hidden_media_urls', hidden, sameUrlList((post as FeedPostRow).hidden_media_urls, hidden));
  }
  if (captions) {
    assign('media_captions', captions, sameJson((post as FeedPostRow).media_captions, captions));
  }
  if (row.checkin_stats !== undefined) {
    assign('checkin_stats', row.checkin_stats, sameJson((post as FeedPostRow).checkin_stats, row.checkin_stats));
  }
  if (row.edited_at !== undefined) {
    assign('edited_at', row.edited_at, (post as FeedPostRow).edited_at === row.edited_at);
  }
  if (row.lift_session_id !== undefined) {
    assign('lift_session_id', row.lift_session_id, (post as FeedPostRow).lift_session_id === row.lift_session_id);
  }
  return next;
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
    return current.filter((post) => post && post.id !== id);
  }
  const id = String(next?.id ?? '');
  if (!id) {
    return current;
  }
  if (event === 'UPDATE') {
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
    return changed ? patched : current;
  }
  return current;
}

export function patchChallengeLiveFeed(
  queryClient: Pick<QueryClient, 'setQueriesData'>,
  challengeId: string,
  payload: LiveFeedRealtimePayload,
): boolean {
  const event = String(payload.eventType ?? '').toUpperCase();
  if (event !== 'UPDATE' && event !== 'DELETE') {
    return false;
  }
  queryClient.setQueriesData({ queryKey: ['feed', challengeId] }, (current) =>
    patchLiveFeedList(current, payload),
  );
  return true;
}
