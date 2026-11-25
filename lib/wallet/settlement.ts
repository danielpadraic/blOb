import { formatCash } from '@/lib/currency';
import { walletReceiptKind, walletReceiptName, type WalletReceiptKind } from '@/lib/walletReceipt';
import { CASH_OUT_MIN_DOLLARS } from '@/lib/cashOut';

/** Cash-out is a later bank transfer. The wallet holds the money until that rail is on. */
export const CASH_OUT_RAIL_LIVE = false;

export type SettlementChip = 'in_wallet' | 'available' | 'cashed_out';

export type SettlementRow = {
  id: string;
  challengeId: string | null;
  title: string;
  kind: WalletReceiptKind | null;
  gross: number;
  fee: number;
  net: number;
  currency: string | null;
  chip: SettlementChip;
  createdAt: string;
  availableAt: string | null;
  place: number | null;
  startsAt: string | null;
  endsAt: string | null;
};

export type LedgerSettlementInput = {
  id: string;
  challenge_id?: string | null;
  challenge_title?: string | null;
  title?: string | null;
  task?: string | null;
  currency?: string | null;
  amount?: number | null;
  entry_type?: string | null;
  reason?: string | null;
  created_at: string;
  settlement_status?: string | null;
  available_at?: string | null;
  fee_cents?: number | null;
  net_cents?: number | null;
  place?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
};

const CASH_OUT_TYPES = new Set(['cash_out', 'cashout', 'withdrawal', 'payout_cash']);

export function settlementChipLabel(chip: SettlementChip): string {
  if (chip === 'available') {
    return 'Available for cash-out';
  }
  if (chip === 'cashed_out') {
    return 'Cashed out';
  }
  return 'Settled · In wallet';
}

function dollarsFromCents(cents: number | null | undefined): number | null {
  const value = Number(cents);
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.round(value) / 100;
}

export function settlementChipFor(input: {
  entryType?: string | null;
  reason?: string | null;
  status?: string | null;
  availableAt?: string | null;
  now?: Date;
}): SettlementChip {
  const type = String(input.entryType ?? '');
  const why = String(input.reason ?? '');
  if (CASH_OUT_TYPES.has(type) || CASH_OUT_TYPES.has(why)) {
    return 'cashed_out';
  }
  const status = String(input.status ?? '').toLowerCase();
  if (status === 'cashed_out' || status === 'paid_out') {
    return 'cashed_out';
  }
  if (!CASH_OUT_RAIL_LIVE) {
    return 'in_wallet';
  }
  const readyAt = input.availableAt ? Date.parse(input.availableAt) : NaN;
  const now = (input.now ?? new Date()).getTime();
  if (Number.isFinite(readyAt) && readyAt > now) {
    return 'in_wallet';
  }
  if (status === 'available') {
    return 'available';
  }
  return 'in_wallet';
}

export function asSettlementRow(input: LedgerSettlementInput, now = new Date()): SettlementRow | null {
  const kind = walletReceiptKind(input.entry_type, input.reason);
  if (!kind || kind === 'Transfer' || kind === 'Buy-in') {
    return null;
  }
  const gross = Math.abs(Number(input.amount) || 0);
  const fee = Math.max(0, dollarsFromCents(input.fee_cents) ?? 0);
  const netFromColumn = dollarsFromCents(input.net_cents);
  const net = netFromColumn != null ? Math.max(0, netFromColumn) : Math.max(0, gross - fee);
  return {
    id: input.id,
    challengeId: String(input.challenge_id ?? '').trim() || null,
    title: walletReceiptName({
      challengeTitle: input.challenge_title,
      title: input.title,
      task: input.task,
    }),
    kind,
    gross,
    fee,
    net,
    currency: input.currency ?? null,
    chip: settlementChipFor({
      entryType: input.entry_type,
      reason: input.reason,
      status: input.settlement_status,
      availableAt: input.available_at,
      now,
    }),
    createdAt: input.created_at,
    availableAt: input.available_at ?? null,
    place: Math.floor(Number(input.place) || 0) || null,
    startsAt: input.starts_at ?? null,
    endsAt: input.ends_at ?? null,
  };
}

function isCash(row: SettlementRow): boolean {
  return String(row.currency ?? '') === 'bucks';
}

/** Available is only cash the bank rail can send. Pending is cash already in the wallet. */
export function cashOutSummary(rows: readonly SettlementRow[]): { available: number; pending: number } {
  let available = 0;
  let pending = 0;
  for (const row of rows) {
    if (!isCash(row) || row.kind === 'Cash out') {
      continue;
    }
    if (row.chip === 'available') {
      available += row.net;
    } else if (row.chip === 'in_wallet') {
      pending += row.net;
    }
  }
  return {
    available: Math.round(available * 100) / 100,
    pending: Math.round(pending * 100) / 100,
  };
}

export function availableHeadline(available: number, pending: number): string {
  if (available > 0) {
    return formatCash(available);
  }
  if (pending > 0) {
    return '$0.00 — settlements pending';
  }
  return formatCash(0);
}

export function receiptHoldLine(row: SettlementRow): string {
  if (row.chip === 'cashed_out') {
    return 'This amount left your blOb wallet.';
  }
  if (row.chip === 'available') {
    return 'Cash-out is available for this amount.';
  }
  if (row.availableAt) {
    return `Cash-out available after ${row.availableAt.slice(0, 10)}.`;
  }
  return 'This amount is in your blOb wallet.';
}

/** Address step is a real screen. No button when there is nowhere honest to go. */
export function cashOutBannerAction(input: {
  bucks?: number | null;
  pending?: number | null;
  hasAddress?: boolean;
}): { label: string; href: '/profile/account' } | null {
  if (CASH_OUT_RAIL_LIVE) {
    return null;
  }
  const cash = Number(input.bucks) || 0;
  const pending = Number(input.pending) || 0;
  const eligible = Math.max(cash, pending) >= CASH_OUT_MIN_DOLLARS;
  if (!eligible || input.hasAddress) {
    return null;
  }
  return { label: 'Add your address', href: '/profile/account' };
}
