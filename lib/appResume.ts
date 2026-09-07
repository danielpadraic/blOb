import type { AppStateStatus } from 'react-native';

/** True background long enough to count as leaving the app — not a picker flash. */
export const MIN_BACKGROUND_MS = 2500;

/**
 * Routes that survive a cold start. These are places where the user is part-way through telling
 * us something, and dropping them on Home would throw the answer away.
 *
 * Background → active never consults this list. Switching apps is not a kill.
 */
const KEEP_ROUTE =
  /\/(onboarding|capture|submit|checkin|create|compose|details|auth|reset-password|forgot-password)/i;

function normalizePath(pathname: string): string {
  return (pathname.split('?')[0] ?? '').replace(/\/$/, '') || '/';
}

function isHomePath(path: string): boolean {
  return path === '/feed' || path === '/' || path === '/home';
}

const EXPLICIT_LAUNCH =
  /(?:^|[/?#]|:\/\/)(?:challenges\/[^/?#]+|invite\/|feed\/p\/|story\/|reel\/)/i;

/**
 * Background is not a kill.
 *
 * Messages, Control Center, the lock screen, or another app must leave the person on the exact
 * screen they left — Lift Logging, History, Play/Tabata, Challenge Live, a composer draft.
 * Home-on-resume used to fire after a couple of seconds in the background. That was the cold-start
 * rule applied to the wrong event.
 */
export function shouldReturnHomeOnResume(_input: {
  previous: AppStateStatus | null;
  next: AppStateStatus;
  backgroundedAt: number | null;
  now: number;
  pathname: string;
  minBackgroundMs?: number;
  platform?: string;
}): boolean {
  return false;
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
 * A lift, History, or last-open challenge must not steal Home after a force-quit. Deep links
 * (notification, challenge View, auth callback) still land where they were pointed.
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
