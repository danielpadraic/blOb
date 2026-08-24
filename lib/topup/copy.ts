import { formatCash } from '@/lib/currency';

/** User-facing card → $ copy. Never “Bucks”. Money states stay plain and warm. */
export const TOPUP_COPY = {
  add: 'Add $',
  title: (amount: number) => `Add ${formatCash(amount)}`,
  pay: (amount: number) => `Pay ${formatCash(amount)}`,
  added: (amount: number) => `Added ${formatCash(amount)}.`,
  body: (amount: number) =>
    `Pay with card. This adds ${formatCash(amount)} to your $ balance.`,
  bodyCreate: (amount: number) =>
    `Pay with card. This adds ${formatCash(amount)} to your $ balance, then brings you back to Create.`,
  bodyChallenge: (amount: number) =>
    `Pay with card. This adds ${formatCash(amount)} to your $ balance, then brings you back to the Skill Tournament.`,
  feeNone: 'You pay exactly this amount. The full amount is added to your $ balance. We don’t take a platform fee.',
  processing: 'Your card payment is processing. The $ will show in your wallet when it clears.',
  canceled: 'Card payment was canceled. Nothing was added.',
  declined: 'Card was declined. Try another card or a smaller amount.',
  insufficientCard: 'That card doesn’t have enough. Try another card or a smaller amount.',
  expired: 'That card is expired. Try another card.',
  network: 'Couldn’t reach the card network. Check your connection and try again.',
  offline: 'You’re offline. Try again when you’re back.',
  already: 'This payment was already added. Your $ balance is up to date.',
  amountLimit: 'You can add between $1.00 and $50.00 at a time.',
  dailyLimit: 'Daily add limit reached. Try again tomorrow.',
  unavailable: 'Card add isn’t available right now. Try again in a moment.',
  generic: 'Couldn’t add $ right now. Try again.',
  notNow: 'Not now',
  history: 'Added $',
} as const;

export function assertsAllowedTopUpLanguage(value: string): boolean {
  return !/\b(buy-?ins?|player-funded|player pool|stakes?|pots?|wagers?|betting|bucks)\b/i.test(value);
}
