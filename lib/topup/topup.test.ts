import { describe, expect, it } from 'vitest';

import { assertsAllowedFundingLanguage, ledgerReceiptLabel } from '@/lib/funding';

import {
  PLATFORM_FEE_CENTS,
  TOPUP_COPY,
  TOPUP_DAILY_MAX_CENTS,
  TOPUP_MAX_CENTS,
  TOPUP_MIN_CENTS,
  applyIdempotentCredit,
  assertsAllowedTopUpLanguage,
  canAcceptDailyTopUp,
  classifyTopUpError,
  countUpValues,
  decideTopUpCredit,
  quoteTopUp,
  remainingDailyTopUpCents,
  topUpErrorCopy,
  validateTopUpAmount,
} from './index';

describe('card to $ top-up', () => {
  it('quotes a $1 add with no platform fee', () => {
    const quote = quoteTopUp(1);
    expect(quote).toEqual({
      creditCents: 100,
      chargeCents: 100,
      platformFeeCents: 0,
      creditAmount: 1,
      chargeAmount: 1,
    });
    expect(PLATFORM_FEE_CENTS).toBe(0);
    expect(quote?.chargeAmount).toBe(quote?.creditAmount);
  });

  it('enforces MVP amount limits', () => {
    expect(validateTopUpAmount(0)).toBe('invalid');
    expect(validateTopUpAmount(0.5)).toBe('limit');
    expect(validateTopUpAmount(1)).toBe('ok');
    expect(validateTopUpAmount(50)).toBe('ok');
    expect(validateTopUpAmount(50.01)).toBe('limit');
    expect(quoteTopUp(0.99)).toBeNull();
    expect(TOPUP_MIN_CENTS).toBe(100);
    expect(TOPUP_MAX_CENTS).toBe(5_000);
  });

  it('enforces the daily add cap', () => {
    expect(remainingDailyTopUpCents(0)).toBe(TOPUP_DAILY_MAX_CENTS);
    expect(canAcceptDailyTopUp(24_900, 100)).toBe(true);
    expect(canAcceptDailyTopUp(24_901, 100)).toBe(false);
    expect(canAcceptDailyTopUp(25_000, 100)).toBe(false);
  });

  it('credits the ledger once for a duplicate payment intent', () => {
    const first = applyIdempotentCredit([], { paymentIntentId: 'pi_1', amount: 1 });
    expect(first.applied).toBe(true);
    expect(first.total).toBe(1);
    const again = applyIdempotentCredit(first.ledger, { paymentIntentId: 'pi_1', amount: 1 });
    expect(again.applied).toBe(false);
    expect(again.total).toBe(1);
    expect(decideTopUpCredit({ incomingPaymentIntentId: 'pi_1', existingPaymentIntentId: 'pi_1' })).toBe(
      'already',
    );
    expect(decideTopUpCredit({ incomingPaymentIntentId: 'pi_2', existingStatus: 'pending' })).toBe('apply');
  });

  it('maps decline, network, already-processed, limits, and offline', () => {
    expect(classifyTopUpError(new Error('card_declined'))).toBe('declined');
    expect(topUpErrorCopy('declined')).toBe(TOPUP_COPY.declined);
    expect(classifyTopUpError(new Error('already_applied'))).toBe('already');
    expect(topUpErrorCopy('already')).toBe(TOPUP_COPY.already);
    expect(classifyTopUpError(new Error('AMOUNT_LIMIT'))).toBe('amount_limit');
    expect(classifyTopUpError(new Error('timeout'))).toBe('network');
    expect(topUpErrorCopy('offline')).toBe(TOPUP_COPY.offline);
    expect(topUpErrorCopy('daily_limit')).toBe(TOPUP_COPY.dailyLimit);
  });

  it('count-up steps land on the new $ balance', () => {
    const steps = countUpValues(2, 3);
    expect(steps[0]).toBeGreaterThan(2);
    expect(steps[steps.length - 1]).toBe(3);
  });

  it('uses plain $ language and never says Bucks', () => {
    for (const value of Object.values(TOPUP_COPY)) {
      const text = typeof value === 'function' ? value(1) : value;
      expect(assertsAllowedTopUpLanguage(text)).toBe(true);
      expect(assertsAllowedFundingLanguage(text)).toBe(true);
    }
    expect(ledgerReceiptLabel('top_up')).toBe(TOPUP_COPY.history);
    expect(assertsAllowedFundingLanguage(ledgerReceiptLabel('top_up'))).toBe(true);
  });
});
