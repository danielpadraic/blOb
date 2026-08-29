import { formatCash, formatWallet } from '@/lib/currency';

export const FORFEIT_RECEIPT =
  'Nobody remaining. The prize is forfeited. No refunds.';
export const VOID_BUYIN_RECEIPT = 'Nobody finished. Entry coins were returned.';
export const VOID_HOST_RECEIPT = 'Nobody finished. Prize returned to the host.';
export const VOID_BOTH_RECEIPT =
  'Nobody finished. Entry coins were returned and the prize returned to the host.';
export const REFUND_BUYIN_REASON = 'refund_buyin';
export const RETURN_HOST_REASON = 'return_host_funding';

export type SettlementVoidKind = 'buyin' | 'host' | 'both' | 'historical_forfeit' | null;

export function isVoidRefundReason(reason?: string | null): boolean {
  return reason === REFUND_BUYIN_REASON || reason === RETURN_HOST_REASON;
}

export function settlementVoidKind(input: {
  winnerCount?: number | null;
  payouts?: Array<{ reason?: string | null } | null> | null;
  slices?: Array<{ reason?: string | null } | null> | null;
}): SettlementVoidKind {
  const reasons = [...(input.payouts ?? []), ...(input.slices ?? [])].map((row) =>
    String(row?.reason ?? ''),
  );
  const buyin = reasons.includes(REFUND_BUYIN_REASON);
  const host = reasons.includes(RETURN_HOST_REASON);
  if (buyin && host) {
    return 'both';
  }
  if (host) {
    return 'host';
  }
  if (buyin) {
    return 'buyin';
  }
  if (input.winnerCount != null && Number(input.winnerCount) === 0) {
    return 'historical_forfeit';
  }
  return null;
}

export function voidReceiptCopy(kind: SettlementVoidKind): string {
  if (kind === 'host') {
    return VOID_HOST_RECEIPT;
  }
  if (kind === 'both') {
    return VOID_BOTH_RECEIPT;
  }
  if (kind === 'buyin') {
    return VOID_BUYIN_RECEIPT;
  }
  return FORFEIT_RECEIPT;
}

export function nobodyFinishedRuleCopy(input: {
  buyInAmount?: number | null;
  hostFunded?: boolean | null;
  hostBudget?: number | null;
  creatorContribution?: number | null;
}): string | null {
  const buyIn = Math.max(Number(input.buyInAmount) || 0, 0) > 0;
  const host =
    Boolean(input.hostFunded) ||
    Math.max(Number(input.hostBudget) || 0, 0) > 0 ||
    Math.max(Number(input.creatorContribution) || 0, 0) > 0;
  if (!buyIn && !host) {
    return null;
  }
  if (buyIn && host) {
    return 'If nobody finishes, entry coins are returned and the prize is returned to the host.';
  }
  if (host) {
    return 'If nobody finishes, the prize is returned to the host.';
  }
  return 'If nobody finishes, entry coins are returned.';
}

export function formatSettlementAmount(
  amount: number | null | undefined,
  currency?: string | null,
): string {
  if (String(currency ?? 'coins') === 'bucks') {
    return formatCash(amount);
  }
  return String(Math.round(Number(amount ?? 0)));
}

export function receiptHeadline(input: {
  joined: boolean;
  winnerCount: number;
  payoutAmount?: number | null;
  currency?: string | null;
  voidKind?: SettlementVoidKind;
}): string {
  if (!input.joined) {
    return 'You were not in this challenge.';
  }
  if (input.voidKind && input.voidKind !== 'historical_forfeit') {
    return voidReceiptCopy(input.voidKind);
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
