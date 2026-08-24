import { formatCash, formatWallet } from '@/lib/currency';

/** User-facing Skill Tournament funding copy. Never buy-in / pot / wager language. */
export const FUNDING_COPY = {
  skillTournament: 'Skill Tournament',
  entryFee: 'Entry fee',
  prize: 'Prize',
  participate: 'Participate',
  participateFree: 'Participate free',
  remainingFinishers: 'Remaining finishers',
  hostContribution: 'Host contribution',
  addToPrize: 'Add to prize',
  entryHelp:
    'The entry fee helps cover technology and tournament management. It also goes into the prize.',
  prizeHelp:
    'The prize is the total of entry fees plus any host funds. Remaining finishers split it evenly.',
  hostHelp: 'Optional. You can add more from your balance any time before settlement.',
  refundBeforeLive: 'Leave before this Skill Tournament goes live and the entry fee comes back in full.',
  committedLive: 'Once live, the entry fee is committed.',
  forfeit: 'Nobody remaining. The prize is forfeited. No refunds.',
  leaveConfirm: 'Leave this Skill Tournament? Your entry fee comes back in full.',
  joinEntryNow: 'The entry fee leaves your wallet now.',
  joinFree: 'Participating is free. The prize is already funded.',
  insufficient: 'Add funds to participate.',
  spectatorPrize: 'Prize total. You have not paid an entry fee.',
  alreadyLive: 'This Skill Tournament is already live. The entry fee is committed.',
  alreadySettled: 'This Skill Tournament is already settled.',
  privateNoFee: 'Private / Corporate Skill Tournaments do not charge an entry fee. The host funds the prize.',
  createTitle: 'New Skill Tournament',
  hostTopUpSuccess: 'Added to the prize.',
} as const;

const FORBIDDEN =
  /\b(buy-?ins?|player-funded|player pool|stakes?|pots?|wagers?|betting|bucks)\b/i;

export function assertsAllowedFundingLanguage(value: string): boolean {
  return !FORBIDDEN.test(value) && !/bucks/i.test(value);
}

export function participateLabel(input: {
  amount: number;
  currency?: string | null;
}): string {
  const amount = Math.max(Number(input.amount) || 0, 0);
  if (amount <= 0) {
    return FUNDING_COPY.participateFree;
  }
  if (String(input.currency ?? '') === 'bucks') {
    return `${FUNDING_COPY.participate} ${formatCash(amount)}`;
  }
  return FUNDING_COPY.participate;
}

export function topUpToParticipateLabel(shortfall: number): string {
  return `Add ${formatCash(shortfall)} to participate`;
}

export function ledgerReceiptLabel(entryType: string | null | undefined): string {
  switch (String(entryType ?? '')) {
    case 'join_escrow':
      return FUNDING_COPY.entryFee;
    case 'leave_refund':
    case 'refund_pre_start':
      return 'Entry fee refund';
    case 'creator_fund_escrow':
      return FUNDING_COPY.hostContribution;
    case 'distribute_win':
      return 'Prize';
    case 'top_up':
      return 'Added $';
    default:
      return 'Wallet';
  }
}

export function formatFundingAmount(
  amount: number | null | undefined,
  currency?: string | null,
): string {
  if (String(currency ?? '') === 'bucks') {
    return formatCash(amount);
  }
  return formatWallet(amount, currency);
}
