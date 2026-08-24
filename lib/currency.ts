import type { Challenge, Profile, WalletCurrency } from '@/lib/types';
import { formatCoins, formatUsd } from '@/utils/format';

export function asWalletCurrency(value: string | null | undefined): WalletCurrency {
  return value === 'bucks' ? 'bucks' : 'coins';
}

export function challengeCurrency(
  challenge: { currency?: string | null } | null | undefined,
): WalletCurrency {
  return asWalletCurrency(challenge?.currency);
}

export function isBucksChallenge(
  challenge: { currency?: string | null } | null | undefined,
): boolean {
  return challengeCurrency(challenge) === 'bucks';
}

export function isSponsoredBucks(
  challenge: Pick<Challenge, 'is_official' | 'buy_in_amount' | 'currency'> | null | undefined,
): boolean {
  if (!challenge) {
    return false;
  }
  return (
    Boolean(challenge.is_official) &&
    isBucksChallenge(challenge) &&
    Number(challenge.buy_in_amount) <= 0
  );
}

export function formatWalletNumber(amount: number | null | undefined): string {
  const value = Number(amount ?? 0);
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/** Cash on challenge cards: $1.00 only. Never “Bucks” or a buck icon. */
export function formatCash(amount: number | null | undefined): string {
  return `$${Number(amount ?? 0).toFixed(2)}`;
}

/** Home strip / compact CTAs: $1 or $10. Cents only when needed. */
export function formatCashCompact(amount: number | null | undefined): string {
  const value = Number(amount ?? 0);
  if (!Number.isFinite(value)) {
    return '$0';
  }
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) {
    return `$${rounded}`;
  }
  return `$${rounded.toFixed(2)}`;
}

export const FREE_ENTRY_LABEL = 'FREE Entry';

export function isFreeEntry(amount: number | null | undefined): boolean {
  return Math.max(Number(amount) || 0, 0) <= 0;
}

/** $5,000 — whole dollars get a comma, no cents. */
export function formatCashPrizeAmount(amount: number | null | undefined): string {
  const value = Number(amount ?? 0);
  if (!Number.isFinite(value)) {
    return '$0';
  }
  const rounded = Math.round(value * 100) / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
  }).format(rounded);
}

export function cashPrizeLabel(amount: number | null | undefined): string {
  return `${formatCashPrizeAmount(amount)} Cash Prize`;
}

/** Amount without the word “Coins.” Cash: $10.00. Coins: 10.00. */
export function formatWalletAmount(
  amount: number | null | undefined,
  currency?: string | null,
): string {
  return asWalletCurrency(currency) === 'bucks'
    ? formatCash(amount)
    : Number(amount ?? 0).toFixed(2);
}

export function formatWallet(
  amount: number | null | undefined,
  currency?: string | null,
): string {
  return asWalletCurrency(currency) === 'bucks' ? formatCash(amount) : formatCoins(amount);
}

export function formatWalletWithUsd(
  amount: number | null | undefined,
  currency?: string | null,
): string {
  const label = formatWallet(amount, currency);
  if (asWalletCurrency(currency) === 'bucks') {
    return `${label} (${formatUsd(amount)})`;
  }
  return label;
}

export function walletBalance(
  profile: Pick<Profile, 'coins' | 'bucks' | 'credits'> | null | undefined,
  currency?: string | null,
): number {
  if (!profile) {
    return 0;
  }
  if (asWalletCurrency(currency) === 'bucks') {
    return Number(profile.bucks ?? 0);
  }
  return Number(profile.coins ?? profile.credits ?? 0);
}

export function currencyNoun(currency?: string | null, plural = true): string {
  if (asWalletCurrency(currency) === 'bucks') {
    return 'USD';
  }
  return plural ? 'Coins' : 'Coin';
}
