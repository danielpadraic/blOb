import type { WeightUnit } from '@/lib/types';

const CM_PER_INCH = 2.54;
const LB_PER_KG = 2.2046226218;

export function cmToFeetInches(cm: number): { feet: number; inches: number } {
  const totalInches = Math.max(0, Math.round(cm / CM_PER_INCH));
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return { feet, inches };
}

export function feetInchesToCm(feet: number, inches: number): number {
  const safeFeet = Number.isFinite(feet) ? feet : 0;
  const safeInches = Number.isFinite(inches) ? inches : 0;
  return Math.round((safeFeet * 12 + safeInches) * CM_PER_INCH * 10) / 10;
}

export function kgToLb(kg: number): number {
  return Math.round(kg * LB_PER_KG * 10) / 10;
}

export function lbToKg(lb: number): number {
  return Math.round((lb / LB_PER_KG) * 10) / 10;
}

export function prettyNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '';
  }
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

export function convertWeight(
  value: number,
  from: WeightUnit,
  to: WeightUnit,
): number {
  if (from === to) {
    return value;
  }
  return from === 'kg' ? kgToLb(value) : lbToKg(value);
}

export function formatHeight(
  cm: number | null | undefined,
  unit: WeightUnit | null | undefined,
): string {
  if (cm == null) {
    return 'Not set';
  }
  if (unit === 'lb') {
    const { feet, inches } = cmToFeetInches(cm);
    return `${feet}′ ${inches}″`;
  }
  return `${prettyNumber(cm)} cm`;
}

export function formatWeight(
  amount: number | null | undefined,
  unit: WeightUnit | null | undefined,
): string {
  if (amount == null) {
    return 'Not set';
  }
  return `${prettyNumber(amount)} ${unit === 'lb' ? 'lb' : 'kg'}`;
}
