/** One header count-up per new credit. lastShown is persisted; session tick blocks remount replay. */

export type HeaderCountCurrency = 'coins' | 'bucks';

export type HeaderCountUpPlan = 'count' | 'snap';

const sessionShown = new Map<string, number>();

function sessionKey(userId: string, currency: HeaderCountCurrency): string {
  return `${userId}:${currency}`;
}

export function resetHeaderCountUpForTests(): void {
  sessionShown.clear();
}

export function headerLastShown(stored: number | null | undefined, current: number): number {
  if (stored == null || !Number.isFinite(Number(stored))) {
    return Math.max(0, Number(current) || 0);
  }
  return Math.max(0, Number(stored) || 0);
}

/** Count only when the wallet rose past lastShown and this credit has not already ticked. */
export function headerCountUpPlan(input: {
  userId?: string | null;
  currency: HeaderCountCurrency;
  lastShown: number;
  current: number;
}): HeaderCountUpPlan {
  const current = Math.max(0, Number(input.current) || 0);
  const lastShown = Math.max(0, Number(input.lastShown) || 0);
  const userId = String(input.userId ?? '').trim();
  if (!userId || current <= lastShown) {
    if (userId) {
      sessionShown.set(sessionKey(userId, input.currency), current);
    }
    return 'snap';
  }
  const already = sessionShown.get(sessionKey(userId, input.currency));
  if (already === current) {
    return 'snap';
  }
  return 'count';
}

export function markHeaderCountUpDone(
  userId: string | null | undefined,
  currency: HeaderCountCurrency,
  current: number,
): void {
  const id = String(userId ?? '').trim();
  if (!id) {
    return;
  }
  sessionShown.set(sessionKey(id, currency), Math.max(0, Number(current) || 0));
}

/** Refund or prize credit raises the header from lastShown. */
export function headerShouldCountRefund(input: {
  lastShown: number;
  current: number;
  credit: number;
}): boolean {
  const credit = Math.max(0, Number(input.credit) || 0);
  if (credit <= 0) {
    return false;
  }
  return Number(input.current) >= Number(input.lastShown) + credit - 1e-9;
}
