import { challengeDisplayTitle, isPlaceholderChallengeTitle } from '@/lib/challengeTitle';
import { challengeDetailHref } from '@/lib/routes';

const REFUND_TYPES = new Set([
  'leave_refund',
  'refund_pre_start',
  'challenge_cancel_refund',
  'refund_buyin',
]);

const BUYIN_TYPES = new Set(['join_escrow', 'buyin', 'buy_in', 'entry_fee']);
const CASH_OUT_TYPES = new Set(['cash_out', 'cashout', 'withdrawal', 'payout_cash']);
const TRANSFER_TYPES = new Set(['transfer', 'send_coins', 'send_bucks']);
const PRIZE_TYPES = new Set([
  'distribute_win',
  'prize',
  'payout',
  'creator_fund_escrow',
  'challenge_payout',
]);

export type WalletReceiptKind = 'Prize' | 'Refund' | 'Buy-in' | 'Cash out' | 'Transfer';

export type WalletReceiptRow = {
  id: string;
  challengeId: string | null;
  title: string;
  place: number | null;
  amount: number;
  currency: string | null;
  createdAt: string;
  refund: boolean;
  kind: WalletReceiptKind | null;
  headline: string;
};

export function isWalletRefundEntry(entryType: string | null | undefined, reason?: string | null): boolean {
  const type = String(entryType ?? '');
  const why = String(reason ?? '');
  return REFUND_TYPES.has(type) || REFUND_TYPES.has(why) || why.includes('refund');
}

/** Prize / Refund / Buy-in / Cash out / Transfer. Never generic Wallet. */
export function walletReceiptKind(
  entryType?: string | null,
  reason?: string | null,
): WalletReceiptKind | null {
  if (isWalletRefundEntry(entryType, reason)) {
    return 'Refund';
  }
  const type = String(entryType ?? '');
  const why = String(reason ?? '');
  if (BUYIN_TYPES.has(type) || BUYIN_TYPES.has(why)) {
    return 'Buy-in';
  }
  if (CASH_OUT_TYPES.has(type) || CASH_OUT_TYPES.has(why)) {
    return 'Cash out';
  }
  if (TRANSFER_TYPES.has(type) || TRANSFER_TYPES.has(why)) {
    return 'Transfer';
  }
  if (PRIZE_TYPES.has(type) || PRIZE_TYPES.has(why) || type === 'distribute_win') {
    return 'Prize';
  }
  if (type === 'top_up' || type === 'coin_grant') {
    return null;
  }
  return type || why ? 'Prize' : null;
}

function usableName(value: string | null | undefined): string {
  const name = String(value ?? '').trim();
  if (!name) {
    return '';
  }
  const lower = name.toLowerCase();
  if (lower === 'this challenge' || lower === 'wallet' || isPlaceholderChallengeTitle(name)) {
    return '';
  }
  return name;
}

/**
 * Receipt name: persisted ledger title, then joined challenge.title / task.
 * Gone challenge → "Challenge prize". Never the literal "this challenge".
 */
export function walletReceiptName(input: {
  challengeTitle?: string | null;
  title?: string | null;
  task?: string | null;
}): string {
  const persisted = usableName(input.challengeTitle);
  if (persisted) {
    return challengeDisplayTitle({ title: persisted }) || persisted;
  }
  const joined = challengeDisplayTitle({ title: input.title, task: input.task });
  if (joined) {
    return joined;
  }
  return 'Challenge prize';
}

export function walletReceiptHeadline(input: {
  entryType?: string | null;
  reason?: string | null;
  challengeTitle?: string | null;
  title?: string | null;
  task?: string | null;
  place?: number | null;
}): string {
  const name = walletReceiptName(input);
  const kind = walletReceiptKind(input.entryType, input.reason);
  if (kind === 'Refund') {
    return `Refund · ${name}`;
  }
  if (kind === 'Buy-in') {
    return `${name} · Buy-in`;
  }
  if (kind === 'Cash out') {
    return `${name} · Cash out`;
  }
  if (kind === 'Transfer') {
    return `${name} · Transfer`;
  }
  if (!kind) {
    return name;
  }
  return `${name} · Prize`;
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
  challenge_title?: string | null;
  title?: string | null;
  task?: string | null;
  place?: number | null;
}): WalletReceiptRow {
  const challengeId = String(input.challenge_id ?? '').trim() || null;
  const kind = walletReceiptKind(input.entry_type, input.reason);
  return {
    id: input.id,
    challengeId,
    title: walletReceiptName({
      challengeTitle: input.challenge_title,
      title: input.title,
      task: input.task,
    }),
    place: Math.floor(Number(input.place) || 0) || null,
    amount: Number(input.amount) || 0,
    currency: input.currency ?? null,
    createdAt: input.created_at,
    refund: isWalletRefundEntry(input.entry_type, input.reason),
    kind,
    headline: walletReceiptHeadline({
      entryType: input.entry_type,
      reason: input.reason,
      challengeTitle: input.challenge_title,
      title: input.title,
      task: input.task,
      place: input.place,
    }),
  };
}
