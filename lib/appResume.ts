import type { AppStateStatus } from 'react-native';

/** True background long enough to count as leaving the app — not a picker flash. */
export const MIN_BACKGROUND_MS = 2500;

const KEEP_ROUTE =
  /\/(onboarding|capture|submit|create|compose|details|auth|reset-password|forgot-password)/i;

const EXPLICIT_LAUNCH =
  /(?:^|[/?#]|:\/\/)(?:challenges\/[0-9a-f-]{8,}|invite\/|feed\/p\/|story\/|reel\/)/i;

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
  const path = (input.pathname.split('?')[0] ?? '').replace(/\/$/, '') || '/';
  if (path === '/feed' || path === '/' || path === '/home') {
    return false;
  }
  if (KEEP_ROUTE.test(path)) {
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

/** Cold start / kill+reopen: Home unless this process was opened from a real link. */
export function shouldResetToHomeOnLaunch(input: {
  pathname: string;
  initialUrl?: string | null;
  platform?: string;
}): boolean {
  if (isExplicitLaunchUrl(input.initialUrl)) {
    return false;
  }
  if (input.platform === 'web') {
    return false;
  }
  return shouldReturnHomeOnResume({
    previous: 'background',
    next: 'active',
    backgroundedAt: 0,
    now: MIN_BACKGROUND_MS + 1,
    pathname: input.pathname,
    platform: input.platform,
  });
}
