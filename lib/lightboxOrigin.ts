import { challengeIdFromPath, isChallengeSubmitPath } from '@/lib/challengeNav';
import { asChallengePageTab, liveChallengeHref } from '@/lib/livePush';

/**
 * Where a maximized proof was opened from. Close (X, swipe-down, hardware back) returns here —
 * never Home, a profile, Lobby, or last-open 30-Day, unless that is where it was opened.
 */
export type LightboxOriginKind = 'live' | 'overview' | 'home' | 'other';

export type LightboxOrigin = {
  kind: LightboxOriginKind;
  challengeId?: string;
  postId?: string;
};

export function lightboxOriginFromPath(
  pathname?: string | null,
  tab?: string | null,
): LightboxOrigin {
  const path = String(pathname ?? '');
  if (path === '/feed' || path.startsWith('/feed/')) {
    return { kind: 'home' };
  }
  const challengeId = challengeIdFromPath(path) ?? undefined;
  if (!challengeId) {
    return { kind: 'other' };
  }
  if (isChallengeSubmitPath(path)) {
    return { kind: 'other', challengeId };
  }
  const page = asChallengePageTab(tab);
  if (page === 'overview' || page === 'board') {
    return { kind: 'overview', challengeId };
  }
  if (page === 'feed' || tab === 'live' || tab === 'feed') {
    return { kind: 'live', challengeId };
  }
  // Named challenge with no tab query: Overview is the screen default. LiveBubble always
  // records `{ kind: 'live' }` itself, so this fallback only hits Overview / Board carousels.
  return { kind: 'overview', challengeId };
}

export function lightboxReturnHref(origin: LightboxOrigin | null | undefined): string | null {
  if (!origin) {
    return null;
  }
  if (origin.kind === 'live' && origin.challengeId) {
    return String(liveChallengeHref(origin.challengeId));
  }
  if (origin.kind === 'overview' && origin.challengeId) {
    return `/challenges/${origin.challengeId}?tab=overview`;
  }
  if (origin.kind === 'home') {
    return '/feed';
  }
  return null;
}

/**
 * True when closing the lightbox must navigate. Same Live thread with the overlay on top
 * stays put so scroll is preserved. Submit leftover and a different route always restore.
 */
export function lightboxNeedsRestore(
  origin: LightboxOrigin | null | undefined,
  pathname?: string | null,
  tab?: string | null,
): boolean {
  if (!origin) {
    return false;
  }
  const path = String(pathname ?? '');
  if (origin.kind === 'home') {
    return path !== '/feed' && path !== '/feed/' && !path.startsWith('/feed?');
  }
  if (origin.kind === 'live') {
    if (!origin.challengeId) {
      return false;
    }
    if (isChallengeSubmitPath(path)) {
      return true;
    }
    const id = challengeIdFromPath(path);
    if (id !== origin.challengeId) {
      return true;
    }
    if (!tab) {
      return false;
    }
    return asChallengePageTab(tab) !== 'feed';
  }
  if (origin.kind === 'overview') {
    if (!origin.challengeId) {
      return false;
    }
    if (isChallengeSubmitPath(path)) {
      return true;
    }
    const id = challengeIdFromPath(path);
    if (id !== origin.challengeId) {
      return true;
    }
    if (!tab) {
      return false;
    }
    return asChallengePageTab(tab) === 'feed';
  }
  return false;
}
