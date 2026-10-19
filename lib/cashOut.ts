/** Cash out is separate from settlement. Promo and Credit never leave the app. */
export const CASH_OUT_MIN_DOLLARS = 25;

export function cashOutBlockReason(input: {
  bucks?: number | null;
  credits?: number | null;
}): string | null {
  const cash = Number(input.bucks);
  const cashable = Number.isFinite(cash) ? cash : 0;
  const credits = Number(input.credits);
  const promo = Number.isFinite(credits) ? credits : 0;
  if (cashable < CASH_OUT_MIN_DOLLARS) {
    if (promo > 0 && cashable <= 0) {
      return 'Promo and Credit stay in the app. Cash out starts at $25.';
    }
    return 'Cash out starts at $25. Promo and Credit stay in the app.';
  }
  return null;
}
