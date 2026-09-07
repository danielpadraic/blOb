import type { Href } from 'expo-router';

/**
 * First path segments the app can actually route to.
 *
 * Route groups like `(tabs)` and `(auth)` do not appear in URLs, so their children are listed at
 * the top level here. `lib/notificationHref.test.ts` asserts this stays in step with the files on
 * disk, so adding a route without adding it here fails the suite rather than silently rejecting a
 * legitimate notification.
 */
export const NOTIFICATION_ROUTE_SEGMENTS: readonly string[] = [
  'admin',
  'auth',
  'capture',
  'challenges',
  'checkin',
  'circles',
  'compose',
  'feed',
  'forgot-password',
  'friends',
  'home',
  'invite',
  'lift',
  'login',
  'messages',
  'notifications',
  'oauthredirect',
  'onboarding',
  'profile',
  'reel',
  'register',
  'round',
  'story',
  'wave',
];

/**
 * Whether a server-supplied notification target is a route this app owns.
 *
 * `data.href` arrives from the database and from push payloads, so it is untrusted input that used
 * to be cast straight to `Href`. A stale or wrong value navigated to nothing and left the user on a
 * blank screen; an absolute or scheme-bearing value would send them out of the app entirely.
 */
export function isSafeNotificationHref(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  // Single leading slash only: `//host` is protocol-relative and leaves the app.
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return false;
  }
  if (/^\/\w+:/.test(trimmed) || trimmed.includes('://')) {
    return false;
  }
  const segment = trimmed.slice(1).split(/[/?#]/)[0];
  if (!segment) {
    // Bare "/" is the index route, which redirects on its own.
    return true;
  }
  return NOTIFICATION_ROUTE_SEGMENTS.includes(segment);
}

/** The href when the app owns it, otherwise null so the caller can fall back. */
export function safeNotificationHref(value: unknown): Href | null {
  return isSafeNotificationHref(value) ? (value.trim() as Href) : null;
}
