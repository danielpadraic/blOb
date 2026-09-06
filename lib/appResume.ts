import type { AppStateStatus } from 'react-native';

/** True background long enough to count as leaving the app — not a picker flash. */
export const MIN_BACKGROUND_MS = 2500;

/**
 * Routes that survive both a resume and a cold start. These are places where the user is part-way
 * through telling us something, and dropping them on Home would throw the answer away.
 */
const KEEP_ROUTE =
  /\/(onboarding|capture|submit|checkin|create|compose|details|auth|reset-password|forgot-password)/i;

/**
 * Routes that survive a resume but not a cold start.
 *
 * Logging a lift is a long session with a lot of app-switching in it — a timer, a podcast, a text
 * back. Coming back to Home mid-workout loses your place. But a killed process reopening straight
 * into a half-finished lift is disorienting, and Home is the honest landing for a fresh start.
 */
const RESUME_ONLY_KEEP_ROUTE = /\/lift(\/|$)/i;

function normalizePath(pathname: string): string {
  return (pathname.split('?')[0] ?? '').replace(/\/$/, '') || '/';
}

function isHomePath(path: string): boolean {
  return path === '/feed' || path === '/' || path === '/home';
}

const EXPLICIT_LAUNCH =
  /(?:^|[/?#]|:\/\/)(?:challenges\/[^/?#]+|invite\/|feed\/p\/|story\/|reel\/)/i;

export function shouldReturnHomeOnResume(input: {
  previous: AppStateStatus | null;
  next: AppStateStatus;
  backgroundedAt: number | null;
  now: number;
  pathname: string;
  minBackgroundMs?: number;
  platform?: string;
}): boolean {
  if (input.next !== 'active') {
    return false;
  }
  if (input.previous !== 'background') {
    return false;
  }
  if (input.backgroundedAt == null) {
    return false;
  }
  const waited = input.now - input.backgroundedAt;
  if (waited < (input.minBackgroundMs ?? MIN_BACKGROUND_MS)) {
    return false;
  }
  const path = normalizePath(input.pathname);
  if (isHomePath(path)) {
    return false;
  }
  if (KEEP_ROUTE.test(path) || RESUME_ONLY_KEEP_ROUTE.test(path)) {
    return false;
  }
  return true;
}

/** Notification, share, or typed challenge URL — not a restored last screen. */
export function isExplicitLaunchUrl(url?: string | null): boolean {
  const value = String(url ?? '').trim();
  if (!value) {
    return false;
  }
  return EXPLICIT_LAUNCH.test(value);
}

/**
 * Cold start / kill+reopen: Home unless this process was opened from a real link.
 *
 * Deliberately not routed through the resume rule. A lift is worth restoring when you switch back
 * to the app, and not worth restoring when you reopen a killed tab.
 */
export function shouldResetToHomeOnLaunch(input: {
  pathname: string;
  initialUrl?: string | null;
  platform?: string;
}): boolean {
  if (isExplicitLaunchUrl(input.initialUrl)) {
    return false;
  }
  const path = normalizePath(input.pathname);
  if (isHomePath(path)) {
    return false;
  }
  return !KEEP_ROUTE.test(path);
}
