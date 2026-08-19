import { THEME } from '@/lib/theme';

/** Tab navigator home. `/` is `app/index.tsx` and must not redirect to itself. */
export const TABS_HREF = '/feed';
export const LOBBY_HREF = '/challenges';

export function challengeDetailHref(id: string, returnTo: 'lobby' | 'feed' = 'lobby') {
  return {
    pathname: '/challenges/[id]' as const,
    params: { id, returnTo },
  };
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
    media === 'video' || media === 'photo' ? media : mode === 'reel' ? 'video' : 'photo';
  return {
    pathname: '/capture' as const,
    params: { mode, media: resolved },
  };
}

export const STORY_CREATE_HREF = captureHref('story');
export const CAPTURE_STORY_HREF = captureHref('story');
export const CAPTURE_REEL_HREF = captureHref('reel');

/** Viewer route stays `/story/[id]` so existing links keep working. User-facing name is Wave. */
export function storyHref(id: string) {
  return {
    pathname: '/story/[id]' as const,
    params: { id },
  };
}

export const MESSAGES_HREF = '/messages' as const;
export const BODY_METRICS_HREF = '/profile/body-metrics' as const;
export const FITNESS_HISTORY_HREF = '/profile/fitness-history' as const;

export function conversationHref(id: string) {
  return {
    pathname: '/messages/[id]' as const,
    params: { id },
  };
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
