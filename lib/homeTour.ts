/** Same value as `SEED_CREDITS` / the lobby grant. Kept here so tests stay RN-free. */
export const HOME_TOUR_COIN_SEED = 100;

const completedIds = new Set<string>();

export function markHomeTourCompleted(userId: string | null | undefined) {
  if (userId) {
    completedIds.add(userId);
  }
}

export function clearHomeTourCompleted(userId: string | null | undefined) {
  if (userId) {
    completedIds.delete(userId);
  }
}

export function wasHomeTourCompleted(
  userId: string | null | undefined,
  tutorialCompletedAt?: string | null,
): boolean {
  if (tutorialCompletedAt) {
    return true;
  }
  return Boolean(userId && completedIds.has(userId));
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
