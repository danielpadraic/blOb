import { challengeDisplayTitle } from '@/lib/challengeTitle';
import { ledgerReceiptLabel } from '@/lib/funding/copy';
import { challengeDetailHref } from '@/lib/routes';

const REFUND_TYPES = new Set([
  'leave_refund',
  'refund_pre_start',
  'challenge_cancel_refund',
  'refund_buyin',
]);

export type WalletReceiptRow = {
  id: string;
  challengeId: string | null;
  title: string;
  place: number | null;
  amount: number;
  currency: string | null;
  createdAt: string;
  refund: boolean;
  headline: string;
};

export function isWalletRefundEntry(entryType: string | null | undefined, reason?: string | null): boolean {
  const type = String(entryType ?? '');
  const why = String(reason ?? '');
  return REFUND_TYPES.has(type) || REFUND_TYPES.has(why) || why.includes('refund');
}

export function walletReceiptHeadline(input: {
  entryType?: string | null;
  reason?: string | null;
  title?: string | null;
  task?: string | null;
  place?: number | null;
}): string {
  const name = challengeDisplayTitle({ title: input.title, task: input.task }) || 'this challenge';
  if (isWalletRefundEntry(input.entryType, input.reason)) {
    return `Refund · ${name}`;
  }
  const place = Math.floor(Number(input.place) || 0);
  if (place > 0) {
    return `${name} · ${place === 1 ? '1st' : place === 2 ? '2nd' : place === 3 ? '3rd' : `${place}th`}`;
  }
  const kind = ledgerReceiptLabel(input.entryType);
  if (kind === 'Prize') {
    return `${name} · Prize`;
  }
  if (kind === 'Wallet') {
    return `${name} · Prize`;
  }
  return `${kind} · ${name}`;
}

export function walletReceiptHref(challengeId: string | null | undefined) {
  const id = String(challengeId ?? '').trim();
  if (!id) {
    return null;
  }
  return challengeDetailHref(id, 'lobby', null, { tab: 'overview' });
}

export function asWalletReceiptRow(input: {
  id: string;
  challenge_id?: string | null;
  currency?: string | null;
  amount?: number | null;
  entry_type?: string | null;
  reason?: string | null;
  created_at: string;
  title?: string | null;
  task?: string | null;
  place?: number | null;
}): WalletReceiptRow {
  const challengeId = String(input.challenge_id ?? '').trim() || null;
  return {
    id: input.id,
    challengeId,
    title: challengeDisplayTitle({ title: input.title, task: input.task }) || 'this challenge',
    place: Math.floor(Number(input.place) || 0) || null,
    amount: Number(input.amount) || 0,
    currency: input.currency ?? null,
    createdAt: input.created_at,
    refund: isWalletRefundEntry(input.entry_type, input.reason),
    headline: walletReceiptHeadline({
      entryType: input.entry_type,
      reason: input.reason,
      title: input.title,
      task: input.task,
      place: input.place,
    }),
  };
}
