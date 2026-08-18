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
