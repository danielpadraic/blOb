import type { AppStateStatus } from 'react-native';

/** True background long enough to count as leaving the app — not a picker flash. */
export const MIN_BACKGROUND_MS = 2500;

const KEEP_ROUTE =
  /\/(onboarding|capture|submit|create|compose|details|auth|reset-password|forgot-password)/i;

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
  if (path === '/feed' || path === '/') {
    return false;
  }
  if (KEEP_ROUTE.test(path)) {
    return false;
  }
  return true;
}
