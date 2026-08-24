import { formatCash, formatWallet } from '@/lib/currency';

export const FORFEIT_RECEIPT =
  'Nobody remaining. The prize is forfeited. No refunds.';

export function formatSettlementAmount(
  amount: number | null | undefined,
  currency?: string | null,
): string {
  if (String(currency ?? 'coins') === 'bucks') {
    return formatCash(amount);
  }
  const value = Number(amount ?? 0);
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function receiptHeadline(input: {
  joined: boolean;
  winnerCount: number;
  payoutAmount?: number | null;
  currency?: string | null;
}): string {
  if (!input.joined) {
    return 'You were not in this challenge.';
  }
  if (input.winnerCount <= 0) {
    return FORFEIT_RECEIPT;
  }
  if (Number(input.payoutAmount) > 0) {
    return `You received ${formatSettlementAmount(input.payoutAmount, input.currency)}.`;
  }
  return 'No payout this time.';
}

export function receiptPaidLine(input: {
  winnerCount: number;
  paid: number;
  currency?: string | null;
  settledAt?: string | null;
}): string {
  if (input.winnerCount <= 0) {
    return FORFEIT_RECEIPT;
  }
  const when = input.settledAt
    ? new Date(input.settledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;
  const paid = formatWallet(input.paid, input.currency);
  return when ? `Paid ${paid} on ${when}.` : `Paid ${paid}.`;
}

export function assertsNoBucksWord(value: string): boolean {
  return !/bucks/i.test(value);
}
