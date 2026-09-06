import type { Href } from 'expo-router';

const TABS_HREF = '/feed' as const;
const LOBBY_HREF = '/challenges' as const;

type BackHref = Href;

type BackRouter = {
  canGoBack: () => boolean;
  back: () => void;
  navigate: (href: Href) => void;
  replace: (href: Href) => void;
};

export function fallbackHref(returnTo?: string | string[], explicit?: Href): Href {
  if (explicit) {
    return explicit;
  }
  const value = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  if (value === 'feed') {
    return TABS_HREF;
  }
  return LOBBY_HREF;
}

/** Home from a post/feed open; lobby pop when that is the real previous screen. */
export function popToFallback(router: BackRouter, fallback: BackHref, preferHistory = false) {
  if (preferHistory && router.canGoBack()) {
    router.back();
    return;
  }
  const toFeed = String(fallback) === '/feed';
  if (toFeed) {
    router.navigate(TABS_HREF);
    return;
  }
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace(fallback);
}
