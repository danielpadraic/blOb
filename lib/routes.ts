import type { Href } from 'expo-router';

import { THEME } from '@/lib/theme';

/** Tab navigator home. `/` is `app/index.tsx` and must not redirect to itself. */
export const TABS_HREF = '/feed';
export const LOBBY_HREF = '/challenges';
export const ADMIN_HREF = '/admin' as Href;
export const ADMIN_ERRORS_HREF = '/admin/errors' as Href;
export const ADMIN_REPORTS_HREF = '/admin/reports' as Href;

export function adminMetricHref(metric: string, range: string): Href {
  return { pathname: '/admin/[metric]', params: { metric, range } } as unknown as Href;
}

export function circleDetailHref(
  id: string,
  extra?: { tab?: 'details' | 'roster' | 'feed'; postId?: string | null },
): Href {
  const circleId = String(id ?? '').trim();
  const qs = new URLSearchParams();
  if (extra?.tab) {
    qs.set('tab', extra.tab);
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
  const query = qs.toString();
  return (`/challenges/create${query ? `?${query}` : ''}`) as Href;
}

export function challengeDetailHref(
  id: string,
  returnTo: 'lobby' | 'feed' = 'lobby',
  postId?: string | null,
  extra?: { tab?: 'overview' | 'board' | 'feed'; receipt?: boolean },
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
  const query = qs.toString();
  return (`/challenges/${challengeId}${query ? `?${query}` : ''}`) as Href;
}

/** Check In / Begin / Continue only. Literal path — object `{ pathname, params }` breaks Safari. Never `/capture`. */
export function checkinSubmitHref(id: string): Href {
  return `/challenges/${String(id ?? '').trim()}/submit` as Href;
}

export function inviteHref(token: string) {
  return {
    pathname: '/invite/[token]' as const,
    params: { token },
  };
}

export const CAPTURE_HREF = '/capture' as const;

/** Query `mode` stays `story` | `reel` | `post` so capture URLs stay stable. User-facing names are Wave / Round / post. */
export function captureHref(mode: 'story' | 'reel' | 'post' = 'story', media?: 'photo' | 'video') {
  const resolved =
    media === 'video' || media === 'photo' ? media : mode === 'post' ? 'photo' : 'video';
  return {
    pathname: '/capture' as const,
    params: { mode, media: resolved },
  };
}

export const STORY_CREATE_HREF = captureHref('story');
export const CAPTURE_STORY_HREF = captureHref('story');
export const CAPTURE_REEL_HREF = captureHref('reel');

export function feedHref(postId?: string | null): Href {
  const id = String(postId ?? '').trim();
  return (id ? `/feed?postId=${encodeURIComponent(id)}` : TABS_HREF) as Href;
}

function clipHref(
  base: 'wave' | 'round',
  id: string,
  extra?: { comments?: boolean; from?: string; sharePrompt?: boolean },
): Href {
  const clipId = String(id ?? '').trim();
  const qs = new URLSearchParams();
  if (extra?.comments) {
    qs.set('comments', '1');
  }
  if (extra?.from) {
    qs.set('from', extra.from);
  }
  if (extra?.sharePrompt) {
    qs.set('sharePrompt', '1');
  }
  const query = qs.toString();
  return (`/${base}/${clipId}${query ? `?${query}` : ''}`) as Href;
}

export function waveHref(id: string, extra?: { comments?: boolean; from?: string; sharePrompt?: boolean }) {
  return clipHref('wave', id, extra);
}

export function roundHref(id: string, extra?: { comments?: boolean; from?: string; sharePrompt?: boolean }) {
  return clipHref('round', id, extra);
}

export function reelHref(id: string, extra?: { comments?: boolean; from?: string; sharePrompt?: boolean }) {
  return roundHref(id, extra);
}

export function storyHref(id: string, extra?: { comments?: boolean; from?: string; sharePrompt?: boolean }) {
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
