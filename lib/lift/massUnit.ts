import type { WeightUnit } from '@/lib/types';

/**
 * Spoken pound mass on Lift cards, Logging readouts, and History.
 *
 * Stored unit stays `lb`. Display is 1 lb / 0 lb / otherwise lbs. Never "lb."
 * Kilos stay kg for every count.
 */
export function formatMassUnit(amount: number, unit: WeightUnit): 'kg' | 'lb' | 'lbs' {
  if (unit === 'kg') {
    return 'kg';
  }
  return amount === 1 || amount === 0 ? 'lb' : 'lbs';
}

/** "130 lbs" / "1 lb" / "0 lb" / "52.5 kg". */
export function formatMassLabel(amount: number, unit: WeightUnit, printed: string): string {
  return `${printed} ${formatMassUnit(amount, unit)}`;
}

/** "22,180 lbs moved". Empty volume is the caller's problem — this always prints a number. */
export function formatMassMoved(total: number, unit: WeightUnit, printed: string): string {
  return `${printed} ${formatMassUnit(total, unit)} moved`;
}
