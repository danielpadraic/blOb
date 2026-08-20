import { formatCash, isBucksChallenge } from '@/lib/currency';

export function joinShortfall(wallet: number, buyIn: number): number {
  const need = Math.max(Number(buyIn) || 0, 0);
  const have = Math.max(Number(wallet) || 0, 0);
  return Math.max(0, Number((need - have).toFixed(2)));
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
    joinLabel: buyIn > 0
      ? cashBuyIn
        ? `Join ${formatCash(buyIn)}`
        : 'Join'
      : 'Join free',
    topUpLabel: `Add ${formatCash(shortfall > 0 ? shortfall : buyIn)} to join`,
  };
}
