export const TOPUP_MIN_CENTS = 100;
export const TOPUP_MAX_CENTS = 5_000;
export const TOPUP_DAILY_MAX_CENTS = 25_000;
export const PLATFORM_FEE_CENTS = 0;

export type TopUpRequest = {
  amount: number;
  returnChallengeId?: string;
  returnCreate?: boolean;
};

export type TopUpStatus = 'pending' | 'succeeded' | 'failed' | 'canceled';

export type TopUpQuote = {
  creditCents: number;
  chargeCents: number;
  platformFeeCents: number;
  creditAmount: number;
  chargeAmount: number;
};

export type TopUpSession = {
  url: string;
  sessionId: string;
  quote: TopUpQuote;
};

export type TopUpResult =
  | { status: 'succeeded'; amount: number; alreadyApplied?: boolean }
  | { status: 'pending' }
  | { status: 'failed'; code: string }
  | { status: 'canceled' };

export function dollarsToCents(amount: number): number {
  return Math.round(Number(amount) * 100);
}

export function centsToDollars(cents: number): number {
  return Math.round(cents) / 100;
}

export function quoteTopUp(amount: number): TopUpQuote | null {
  const creditCents = dollarsToCents(amount);
  if (!Number.isFinite(creditCents) || creditCents < TOPUP_MIN_CENTS || creditCents > TOPUP_MAX_CENTS) {
    return null;
  }
  const chargeCents = creditCents + PLATFORM_FEE_CENTS;
  return {
    creditCents,
    chargeCents,
    platformFeeCents: PLATFORM_FEE_CENTS,
    creditAmount: centsToDollars(creditCents),
    chargeAmount: centsToDollars(chargeCents),
  };
}

export function validateTopUpAmount(amount: number): 'ok' | 'invalid' | 'limit' {
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'invalid';
  }
  const cents = dollarsToCents(amount);
  if (cents < TOPUP_MIN_CENTS || cents > TOPUP_MAX_CENTS) {
    return 'limit';
  }
  return 'ok';
}

export function remainingDailyTopUpCents(usedCents: number): number {
  const used = Math.max(Math.round(Number(usedCents) || 0), 0);
  return Math.max(TOPUP_DAILY_MAX_CENTS - used, 0);
}

export function canAcceptDailyTopUp(usedCents: number, creditCents: number): boolean {
  return creditCents > 0 && creditCents <= remainingDailyTopUpCents(usedCents);
}

export function decideTopUpCredit(input: {
  existingPaymentIntentId?: string | null;
  incomingPaymentIntentId: string;
  existingStatus?: TopUpStatus | string | null;
}): 'apply' | 'already' | 'skip' {
  const incoming = String(input.incomingPaymentIntentId || '').trim();
  if (!incoming) {
    return 'skip';
  }
  if (input.existingStatus === 'succeeded' || input.existingPaymentIntentId === incoming) {
    return 'already';
  }
  return 'apply';
}

export function applyIdempotentCredit(
  ledger: Array<{ paymentIntentId: string; amount: number }>,
  credit: { paymentIntentId: string; amount: number },
): { ledger: Array<{ paymentIntentId: string; amount: number }>; applied: boolean; total: number } {
  const existing = ledger.find((row) => row.paymentIntentId === credit.paymentIntentId);
  if (existing) {
    return {
      ledger,
      applied: false,
      total: ledger.reduce((sum, row) => sum + row.amount, 0),
    };
  }
  const next = [...ledger, credit];
  return {
    ledger: next,
    applied: true,
    total: next.reduce((sum, row) => sum + row.amount, 0),
  };
}

export function countUpValues(from: number, to: number, steps = 16): number[] {
  const start = Number(from) || 0;
  const end = Number(to) || 0;
  if (end <= start) {
    return [end];
  }
  const count = Math.min(24, Math.max(8, steps));
  const step = (end - start) / count;
  const values: number[] = [];
  for (let i = 1; i <= count; i += 1) {
    values.push(Math.round((start + step * i) * 100) / 100);
  }
  values[values.length - 1] = Math.round(end * 100) / 100;
  return values;
}
