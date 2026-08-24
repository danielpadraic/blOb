import { isBucksChallenge } from '@/lib/currency';
import { participateLabel, topUpToParticipateLabel } from '@/lib/funding/copy';
import { joinShortfall as fundingShortfall } from '@/lib/funding/model';

export function joinShortfall(wallet: number, buyIn: number): number {
  return fundingShortfall(wallet, buyIn);
}

export function bucksJoinCta(input: {
  currency?: string | null;
  buyIn: number;
  wallet: number;
  hasProfile: boolean;
}): { needsTopUp: boolean; joinLabel: string; topUpLabel: string; shortfall: number } {
  const buyIn = Math.max(Number(input.buyIn) || 0, 0);
  const shortfall = joinShortfall(input.wallet, buyIn);
  const cashBuyIn = isBucksChallenge({ currency: input.currency });
  return {
    needsTopUp: cashBuyIn && buyIn > 0 && input.hasProfile && shortfall > 0,
    shortfall,
    joinLabel: participateLabel({ amount: buyIn, currency: input.currency }),
    topUpLabel: topUpToParticipateLabel(shortfall > 0 ? shortfall : buyIn),
  };
}
