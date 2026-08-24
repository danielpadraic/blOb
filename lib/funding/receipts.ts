import { FORFEIT_RECEIPT } from '@/lib/settlement/receipts';

import { FUNDING_COPY, formatFundingAmount } from './copy';
import type { FundingSnapshot } from './model';

export type FundingReceiptLines = {
  entryFee: string | null;
  refund: string | null;
  hostContribution: string | null;
  entryFeesCollected: string | null;
  prize: string;
  yourShare: string | null;
  remainingFinishers: string;
  forfeit: string | null;
};

export function fundingReceiptLines(input: {
  funding: FundingSnapshot;
  viewerEntryFee?: number | null;
  viewerRefund?: number | null;
  viewerPayout?: number | null;
  winnerCount: number;
  spectator?: boolean;
}): FundingReceiptLines {
  const { funding } = input;
  const currency = funding.currency;
  const winnerCount = Math.max(Number(input.winnerCount) || 0, 0);
  const entryPaid = Math.max(Number(input.viewerEntryFee) || 0, 0);
  const refunded = Math.max(Number(input.viewerRefund) || 0, 0);
  return {
    entryFee:
      input.spectator || entryPaid <= 0
        ? null
        : `${FUNDING_COPY.entryFee} ${formatFundingAmount(entryPaid, currency)}`,
    refund:
      refunded > 0 ? `Refund ${formatFundingAmount(refunded, currency)}` : null,
    hostContribution:
      funding.hostContribution > 0
        ? `${FUNDING_COPY.hostContribution} ${formatFundingAmount(funding.hostContribution, currency)}`
        : null,
    entryFeesCollected:
      funding.entryFeesCollected > 0
        ? `Entry fees ${formatFundingAmount(funding.entryFeesCollected, currency)}`
        : null,
    prize: `${FUNDING_COPY.prize} ${formatFundingAmount(funding.prizeTotal, currency)}`,
    yourShare:
      Number(input.viewerPayout) > 0
        ? `Your share ${formatFundingAmount(input.viewerPayout, currency)}`
        : null,
    remainingFinishers: `${FUNDING_COPY.remainingFinishers} ${winnerCount}`,
    forfeit: winnerCount <= 0 ? FORFEIT_RECEIPT : null,
  };
}
