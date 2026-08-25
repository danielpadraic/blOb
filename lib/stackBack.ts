const TABS_HREF = '/feed';
const LOBBY_HREF = '/challenges';

type BackHref = typeof TABS_HREF | typeof LOBBY_HREF | string;

type BackRouter = {
  canGoBack: () => boolean;
  back: () => void;
  navigate: (href: BackHref) => void;
  replace: (href: BackHref) => void;
};

export function fallbackHref(returnTo?: string | string[], explicit?: BackHref): BackHref {
  if (explicit) {
    return explicit;
  }
  const value = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  if (value === 'feed') {
    return '/feed';
  }
  return LOBBY_HREF;
}

/** Home from a post/feed open; lobby pop when that is the real previous screen. */
export function popToFallback(router: BackRouter, fallback: BackHref, preferHistory = false) {
  if (preferHistory && router.canGoBack()) {
    router.back();
    return;
  }
  const toFeed = fallback === TABS_HREF || fallback === '/feed';
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
