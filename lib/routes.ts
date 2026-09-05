import type { Href } from 'expo-router';

import { THEME } from '@/lib/theme';

/** Tab navigator home. `/` is `app/index.tsx` and must not redirect to itself. */
export const TABS_HREF = '/feed';
export const LOBBY_HREF = '/challenges';

const CLIP_ROUTE_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Wave / Round route param. Rejects `undefined`, empty, and non-uuid. */
export function clipRouteId(value: unknown): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const id = String(raw ?? '').trim();
  return CLIP_ROUTE_ID_RE.test(id) ? id : null;
}

/** Supabase insert id: `row.id`, `data.id`, or `data[0].id`. */
export function publishedRowId(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === 'string') {
    return clipRouteId(value);
  }
  if (Array.isArray(value)) {
    return publishedRowId(value[0]);
  }
  if (typeof value === 'object') {
    const rec = value as { id?: unknown; data?: unknown };
    return clipRouteId(rec.id) ?? publishedRowId(rec.data);
  }
  return null;
}
export const ADMIN_HREF = '/admin' as Href;
export const ADMIN_ERRORS_HREF = '/admin/errors' as Href;
export const ADMIN_REPORTS_HREF = '/admin/reports' as Href;

export function adminMetricHref(metric: string, range: string): Href {
  return { pathname: '/admin/[metric]', params: { metric, range } } as unknown as Href;
}

export function circleDetailHref(
  id: string,
  extra?: { tab?: 'details' | 'roster' | 'feed' | 'chat'; postId?: string | null },
): Href {
  const circleId = String(id ?? '').trim();
  const qs = new URLSearchParams();
  if (extra?.tab) {
    qs.set('tab', extra.tab === 'feed' ? 'chat' : extra.tab);
  }
  if (extra?.postId) {
    qs.set('postId', extra.postId);
  }
  const query = qs.toString();
  return (`/circles/${circleId}${query ? `?${query}` : ''}`) as Href;
}

export const CIRCLES_CREATE_HREF = '/circles/create' as Href;

export function createChallengeHref(extra?: {
  mode?: 'simple' | 'advanced';
  circleId?: string | null;
  returnTo?: string;
  template?: string | null;
  src?: string | null;
  days?: number | string | null;
  freq?: number | string | null;
  vis?: string | null;
  title?: string | null;
}): Href {
  const qs = new URLSearchParams();
  if (extra?.mode) {
    qs.set('mode', extra.mode);
  }
  if (extra?.circleId) {
    qs.set('circle', extra.circleId);
  }
  if (extra?.returnTo) {
    qs.set('returnTo', extra.returnTo);
  }
  if (extra?.template) {
    qs.set('template', extra.template);
  }
  if (extra?.src) {
    qs.set('src', extra.src);
  }
  if (extra?.days != null && String(extra.days).trim()) {
    qs.set('days', String(extra.days));
  }
  if (extra?.freq != null && String(extra.freq).trim()) {
    qs.set('freq', String(extra.freq));
  }
  if (extra?.vis) {
    qs.set('vis', extra.vis);
  }
  if (extra?.title) {
    qs.set('title', extra.title);
  }
  const query = qs.toString();
  return (`/challenges/create${query ? `?${query}` : ''}`) as Href;
}

/** Overview / Live for this row only. Never last-open. Never the Lobby list. */
export function challengeHref(id: string): Href {
  return `/challenges/${String(id ?? '').trim()}` as Href;
}

/** Home named-challenge taps. `?tab=feed` only for Pulse / Live chips. */
export function namedChallengeHref(id: string, extra?: { tab?: 'feed' }): Href {
  const path = String(challengeHref(id));
  return extra?.tab === 'feed' ? (`${path}?tab=feed` as Href) : (path as Href);
}

export function challengeDetailHref(
  id: string,
  returnTo: 'lobby' | 'feed' = 'lobby',
  postId?: string | null,
  extra?: {
    tab?: 'overview' | 'board' | 'feed';
    receipt?: boolean;
    commentId?: string | null;
    notice?: string | null;
  },
): Href {
  const challengeId = String(id ?? '').trim();
  const qs = new URLSearchParams();
  if (returnTo === 'feed') {
    qs.set('returnTo', 'feed');
  }
  if (postId) {
    qs.set('postId', postId);
  }
  if (extra?.tab) {
    qs.set('tab', extra.tab);
  }
  if (extra?.receipt) {
    qs.set('receipt', '1');
  }
  const commentId = String(extra?.commentId ?? '').trim();
  if (commentId) {
    qs.set('comments', '1');
    qs.set('commentId', commentId);
  }
  // Extras never block Send: a failed extra rides along as a line, not an error screen.
  const notice = String(extra?.notice ?? '').trim();
  if (notice) {
    qs.set('notice', notice);
  }
  const query = qs.toString();
  const path = String(challengeHref(challengeId));
  return (query ? `${path}?${query}` : path) as Href;
}

export const MULTI_CHECKIN_HREF = '/checkin' as Href;

/** Hub after a Send from Multi Check-In. Literal path — Safari. */
export function multiCheckinHref(
  doneIds?: string[] | string | null,
  notice?: string | null,
): Href {
  const ids = (Array.isArray(doneIds) ? doneIds : doneIds ? [doneIds] : [])
    .map((id) => String(id ?? '').trim())
    .filter(Boolean);
  const parts: string[] = [];
  if (ids.length > 0) {
    parts.push(`done=${ids.join(',')}`);
  }
  const line = String(notice ?? '').trim();
  if (line) {
    parts.push(`notice=${encodeURIComponent(line)}`);
  }
  return (parts.length ? `${MULTI_CHECKIN_HREF}?${parts.join('&')}` : MULTI_CHECKIN_HREF) as Href;
}

/** Check In / Begin / Continue only. Literal path — object `{ pathname, params }` breaks Safari. Never `/capture`. */
export function checkinSubmitHref(
  id: string,
  extra?: { from?: 'multi'; done?: string[] | string | null },
): Href {
  const path = `/challenges/${String(id ?? '').trim()}/submit`;
  if (extra?.from !== 'multi') {
    return path as Href;
  }
  const done = (Array.isArray(extra.done) ? extra.done : extra.done ? [extra.done] : [])
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);
  return done.length > 0 ? (`${path}?from=multi&done=${done.join(',')}` as Href) : (`${path}?from=multi` as Href);
}

/** Bob Retry after a crash. Never reload `/capture` (that reopens Wave). */
export function errorRetryHref(pathname: string | null | undefined): string {
  const path = String(pathname ?? '');
  if (path.includes('/capture') || path.includes('/feed/compose') || path === '/compose') {
    return '/feed';
  }
  const watch = path.match(/^\/(wave|round|story|reel)\/([^/?#]*)/);
  if (watch && !clipRouteId(watch[2])) {
    return '/feed';
  }
  const submit = path.match(/\/challenges\/([^/?#]+)\/submit/);
  if (submit?.[1]) {
    return `/challenges/${submit[1]}/submit`;
  }
  const live = path.match(/\/challenges\/([^/?#]+)/);
  if (live?.[1]) {
    return `/challenges/${live[1]}?tab=feed`;
  }
  return path || '/feed';
}

export function inviteHref(token: string) {
  return {
    pathname: '/invite/[token]' as const,
    params: { token },
  };
}

export const CAPTURE_HREF = '/capture' as const;

/** Query `mode` stays `story` | `reel` | `post` so capture URLs stay stable. User-facing names are Wave / Round / post. */
export function captureHref(
  mode: 'story' | 'reel' | 'post' = 'story',
  media?: 'photo' | 'video',
  extra?: { challengeId?: string | null },
) {
  const resolved =
    media === 'video' || media === 'photo' ? media : mode === 'post' ? 'photo' : 'video';
  const challengeId = String(extra?.challengeId ?? '').trim();
  return {
    pathname: '/capture' as const,
    params: challengeId ? { mode, media: resolved, challengeId } : { mode, media: resolved },
  };
}

export const STORY_CREATE_HREF = captureHref('story');
export const CAPTURE_STORY_HREF = captureHref('story');
export const CAPTURE_REEL_HREF = captureHref('reel');

export function feedHref(postId?: string | null, extra?: { commentId?: string | null }): Href {
  const id = String(postId ?? '').trim();
  if (!id) {
    return TABS_HREF as Href;
  }
  const qs = new URLSearchParams();
  qs.set('postId', id);
  const commentId = String(extra?.commentId ?? '').trim();
  if (commentId) {
    qs.set('comments', '1');
    qs.set('commentId', commentId);
  }
  return `/feed?${qs.toString()}` as Href;
}

type ClipHrefExtra = {
  comments?: boolean;
  from?: string;
  sharePrompt?: boolean;
  commentId?: string;
};

function clipHref(base: 'wave' | 'round', id: string, extra?: ClipHrefExtra): Href {
  const clipId = clipRouteId(id);
  if (!clipId) {
    return TABS_HREF as Href;
  }
  const qs = new URLSearchParams();
  if (extra?.comments || extra?.commentId) {
    qs.set('comments', '1');
  }
  if (extra?.from) {
    qs.set('from', extra.from);
  }
  if (extra?.sharePrompt) {
    qs.set('sharePrompt', '1');
  }
  if (extra?.commentId) {
    qs.set('commentId', extra.commentId);
  }
  const query = qs.toString();
  return (`/${base}/${clipId}${query ? `?${query}` : ''}`) as Href;
}

export function waveHref(id: string, extra?: ClipHrefExtra) {
  return clipHref('wave', id, extra);
}

export function roundHref(id: string, extra?: ClipHrefExtra) {
  return clipHref('round', id, extra);
}

export function reelHref(id: string, extra?: ClipHrefExtra) {
  return roundHref(id, extra);
}

export function storyHref(id: string, extra?: ClipHrefExtra) {
  return waveHref(id, extra);
}

/** Wave / Round watch surface. Hide Home chrome while these routes are open. */
export function isWatchSurfacePath(pathname?: string | null): boolean {
  if (!pathname) {
    return false;
  }
  return (
    pathname === '/wave' ||
    pathname.startsWith('/wave/') ||
    pathname === '/round' ||
    pathname.startsWith('/round/') ||
    pathname === '/story' ||
    pathname.startsWith('/story/') ||
    pathname === '/reel' ||
    pathname.startsWith('/reel/')
  );
}

export const MESSAGES_HREF = '/messages' as const;
export const BODY_METRICS_HREF = '/profile/body-metrics' as const;
export const FITNESS_HISTORY_HREF = '/profile/fitness-history' as const;

/** Lift: pick muscles, then log. Private to the owner — never a public profile surface. */
export const LIFT_START_HREF = '/lift' as Href;
export const LIFTS_HISTORY_HREF = '/profile/lifts' as Href;

/** Literal path, like the check-in hrefs: an object `{ pathname, params }` breaks Safari. */
export function liftSessionHref(id: string): Href {
  return `/lift/${String(id ?? '').trim()}` as Href;
}
export const INTERESTS_HREF = '/profile/interests' as Href;

export function conversationHref(
  id: string,
  extra?: { peerId?: string; focus?: boolean; draft?: string },
) {
  return {
    pathname: '/messages/[id]' as const,
    params: {
      id,
      ...(extra?.peerId ? { peerId: extra.peerId } : {}),
      ...(extra?.focus ? { focus: '1' } : {}),
      ...(extra?.draft ? { draft: extra.draft } : {}),
    },
  };
}

/** Open a DM from a profile/Friends row before the thread id exists. */
export function directMessageHref(peerId: string) {
  return conversationHref('new', { peerId, focus: true });
}

export const TAB_STACK_SCREEN_OPTIONS = {
  headerTintColor: THEME.textPrimary,
  headerStyle: { backgroundColor: THEME.background },
  headerShadowVisible: false,
  headerBackTitle: 'Back',
  headerTitleStyle: { fontWeight: '700' as const, color: THEME.textPrimary },
  contentStyle: { backgroundColor: THEME.background },
};

export const HIDDEN_STACK_HEADER = { headerShown: false } as const;
export const PROFILE_STACK_TITLE = { title: 'Profile' } as const;
