import { authStorage } from '@/lib/utils/secureStore';

/** Same value as `SEED_CREDITS` / the lobby grant. Kept here so tests stay RN-free. */

export const HOME_TOUR_COIN_SEED = 100;

const STORAGE_PREFIX = 'blob:home-tour-dismissed:';
const completedIds = new Set<string>();

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function readLocalDismissed(userId: string): boolean {
  if (completedIds.has(userId)) {
    return true;
  }
  try {
    if (typeof localStorage === 'undefined') {
      return false;
    }
    const raw = localStorage.getItem(storageKey(userId));
    if (raw === '1') {
      completedIds.add(userId);
      return true;
    }
  } catch {
    // In-memory is enough until the profile row returns.
  }
  return false;
}

function writeLocalDismissed(userId: string, dismissed: boolean) {
  if (dismissed) {
    completedIds.add(userId);
  } else {
    completedIds.delete(userId);
  }
  const key = storageKey(userId);
  try {
    if (typeof localStorage !== 'undefined') {
      if (dismissed) {
        localStorage.setItem(key, '1');
      } else {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Session flag still blocks a second open this visit.
  }
  try {
    if (dismissed) {
      void authStorage.setItem(key, '1').catch(() => undefined);
      return;
    }
    void authStorage.removeItem(key).catch(() => undefined);
  } catch {
    // Memory already recorded this session.
  }
}

/** Cold start on iOS has no localStorage. SecureStore is the local completed flag. */
export async function hydrateHomeTour(userId: string | null | undefined): Promise<void> {
  if (!userId) {
    return;
  }
  try {
    const raw = await authStorage.getItem(storageKey(userId));
    if (raw === '1') {
      completedIds.add(userId);
    }
  } catch {
    // Profile timestamp still counts once it arrives.
  }
}

export function markHomeTourCompleted(userId: string | null | undefined) {
  if (userId) {
    writeLocalDismissed(userId, true);
  }
}

export function clearHomeTourCompleted(userId: string | null | undefined) {
  if (userId) {
    writeLocalDismissed(userId, false);
  }
}

export function wasHomeTourCompleted(
  userId: string | null | undefined,
  tutorialCompletedAt?: string | null,
): boolean {
  if (tutorialCompletedAt) {
    return true;
  }
  return Boolean(userId && readLocalDismissed(userId));
}

export function isWalletReadyForHomeTour(profile: {
  coins?: number | null;
  credits?: number | null;
  last_shown_coin_balance?: number | null;
} | null): boolean {
  if (!profile) {
    return false;
  }
  const coins = Number(profile.coins ?? profile.credits ?? 0);
  if (Number.isFinite(coins) && coins > 0) {
    return true;
  }
  return profile.last_shown_coin_balance != null;
}

/** First-run header: never flash 0.00 while the lobby grant is in flight. */
export function headerCoinsForTour(
  profile: {
    coins?: number | null;
    credits?: number | null;
    tutorial_completed_at?: string | null;
  } | null,
): number {
  const coins = Number(profile?.coins ?? profile?.credits ?? 0);
  if (Number.isFinite(coins) && coins > 0) {
    return coins;
  }
  if (profile && !profile.tutorial_completed_at) {
    return HOME_TOUR_COIN_SEED;
  }
  return Number.isFinite(coins) ? coins : 0;
}
