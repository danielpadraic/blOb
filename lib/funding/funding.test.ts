import { describe, expect, it } from 'vitest';

import { evenSplitShares } from '@/lib/settlement/shares';

import { applyLaneForPublish } from '@/lib/challengeLane';

import {
  FUNDING_COPY,
  assertsAllowedFundingLanguage,
  canRefundEntryFee,
  evenSplitCombinedPrize,
  fundingFromChallenge,
  fundingModelOf,
  fundingReceiptLines,
  isPrivateFundingLock,
  ledgerReceiptLabel,
  participateLabel,
  predictedPrize,
} from './index';

describe('Skill Tournament funding', () => {
  it('collects the entry fee into the prize', () => {
    const funding = fundingFromChallenge({
      buy_in_amount: 10,
      creator_contribution: 0,
      prize_pool: 20,
      currency: 'bucks',
    });
    expect(funding.entryFee).toBe(10);
    expect(funding.entryFeesCollected).toBe(20);
    expect(funding.prizeTotal).toBe(20);
    expect(predictedPrize({ entryFee: 10, hostContribution: 0, participantCount: 2 })).toBe(20);
  });

  it('refunds the entry fee in full before live', () => {
    expect(canRefundEntryFee('open')).toBe(true);
    expect(canRefundEntryFee('upcoming')).toBe(true);
    expect(canRefundEntryFee('live')).toBe(false);
    expect(canRefundEntryFee('settling')).toBe(false);
    const afterLeave = predictedPrize({ entryFee: 10, hostContribution: 5, participantCount: 1 });
    expect(afterLeave).toBe(15);
  });

  it('increases the prize when the host adds funds', () => {
    const before = fundingFromChallenge({
      buy_in_amount: 10,
      creator_contribution: 5,
      prize_pool: 25,
      currency: 'bucks',
    });
    expect(before.hostContribution).toBe(5);
    expect(before.prizeTotal).toBe(25);
    const after = fundingFromChallenge({
      ...before,
      creator_contribution: 15,
      prize_pool: 35,
      buy_in_amount: 10,
    });
    expect(after.hostContribution).toBe(15);
    expect(after.prizeTotal).toBe(35);
    expect(after.entryFeesCollected).toBe(20);
  });

  it('even-splits the combined prize among remaining finishers', () => {
    const prize = predictedPrize({ entryFee: 10, hostContribution: 20, participantCount: 3 });
    expect(prize).toBe(50);
    expect(evenSplitCombinedPrize(prize, 2)).toEqual([25, 25]);
    expect(evenSplitShares(50, 2)).toEqual([25, 25]);
    expect(evenSplitCombinedPrize(100, 3)).toEqual([33.33, 33.33, 33.34]);
  });

  it('forfeits when 0 remaining finishers', () => {
    expect(evenSplitCombinedPrize(40, 0)).toEqual([]);
    const lines = fundingReceiptLines({
      funding: fundingFromChallenge({
        buy_in_amount: 10,
        creator_contribution: 10,
        prize_pool: 30,
        currency: 'bucks',
      }),
      viewerEntryFee: 10,
      winnerCount: 0,
    });
    expect(lines.forfeit).toBe(FUNDING_COPY.forfeit);
    expect(lines.entryFee).toContain('$10.00');
  });

  it('uses only allowed Skill Tournament language', () => {
    for (const value of Object.values(FUNDING_COPY)) {
      expect(assertsAllowedFundingLanguage(value)).toBe(true);
    }
    expect(assertsAllowedFundingLanguage(participateLabel({ amount: 5, currency: 'bucks' }))).toBe(true);
    expect(assertsAllowedFundingLanguage(ledgerReceiptLabel('join_escrow'))).toBe(true);
    expect(assertsAllowedFundingLanguage('buy-in')).toBe(false);
    expect(assertsAllowedFundingLanguage('player pool')).toBe(false);
    expect(assertsAllowedFundingLanguage('stakes')).toBe(false);
    expect(assertsAllowedFundingLanguage('the pot')).toBe(false);
    expect(assertsAllowedFundingLanguage('Bucks')).toBe(false);
  });

  it('keeps a $ entry fee on publish', () => {
    expect(
      applyLaneForPublish({
        currency: 'bucks',
        buy_in_amount: 10,
        visibility: 'public',
      }).buy_in_amount,
    ).toBe(10);
    expect(
      applyLaneForPublish({
        challenge_lane: 'private',
        currency: 'bucks',
        buy_in_amount: 10,
      }).buy_in_amount,
    ).toBe(0);
  });

  it('locks Private / Corporate to host-funded, no entry fee', () => {
    expect(isPrivateFundingLock({ privacy_mode: 'private_corporate' })).toBe(true);
    expect(fundingModelOf({ entryFee: 10, hostContribution: 5, privateLocked: true })).toBe('creator');
    expect(
      fundingFromChallenge({
        buy_in_amount: 10,
        creator_contribution: 25,
        prize_pool: 25,
        privacy_mode: 'private_corporate',
        currency: 'bucks',
      }).entryFee,
    ).toBe(0);
  });
});
