import type { WeightUnit } from '@/lib/types';
import { cmToFeetInches, feetInchesToCm, kgToLb, lbToKg, prettyNumber } from '@/utils/units';

export type BodyGender = 'male' | 'female';
export type BodyUnitSystem = 'imperial' | 'metric';

export const BODY_FAT_MIN = 5;
export const BODY_FAT_MAX = 45;
export const BODY_FAT_DEFAULT = 20;
export const BODY_FAT_FRAME_COUNT = 10;

export function clampBodyFat(value: number): number {
  if (!Number.isFinite(value)) {
    return BODY_FAT_DEFAULT;
  }
  return Math.min(BODY_FAT_MAX, Math.max(BODY_FAT_MIN, Math.round(value * 10) / 10));
}

/** Map 5–45% onto the nearest of 10 representative frames. */
export function bodyFatFrameIndex(percent: number): number {
  const pct = clampBodyFat(percent);
  const scaled = ((pct - BODY_FAT_MIN) / (BODY_FAT_MAX - BODY_FAT_MIN)) * (BODY_FAT_FRAME_COUNT - 1);
  return Math.max(0, Math.min(BODY_FAT_FRAME_COUNT - 1, Math.round(scaled)));
}

/** Snap a body-fat % onto the representative frame’s percent. */
export function bodyFatSnapPercent(percent: number): number {
  const index = bodyFatFrameIndex(percent);
  return clampBodyFat(
    BODY_FAT_MIN + (index / Math.max(BODY_FAT_FRAME_COUNT - 1, 1)) * (BODY_FAT_MAX - BODY_FAT_MIN),
  );
}

export function calcBmi(heightCm: number, weightKg: number): number | null {
  if (!Number.isFinite(heightCm) || !Number.isFinite(weightKg) || heightCm < 80 || weightKg < 20) {
    return null;
  }
  const meters = heightCm / 100;
  const bmi = weightKg / (meters * meters);
  if (!Number.isFinite(bmi) || bmi < 8 || bmi > 80) {
    return null;
  }
  return Math.round(bmi * 10) / 10;
}

export function formatBmi(bmi: number | null): string {
  if (bmi == null) {
    return '—';
  }
  return String(bmi);
}

export function unitSystemFromWeightUnit(unit?: WeightUnit | null): BodyUnitSystem {
  return unit === 'kg' ? 'metric' : 'imperial';
}

export function weightUnitFromSystem(system: BodyUnitSystem): WeightUnit {
  return system === 'metric' ? 'kg' : 'lb';
}

export function displayWeight(weightKg: number, system: BodyUnitSystem): number {
  return system === 'metric' ? Math.round(weightKg * 10) / 10 : kgToLb(weightKg);
}

export function inputWeightToKg(value: number, system: BodyUnitSystem): number {
  return system === 'metric' ? Math.round(value * 10) / 10 : lbToKg(value);
}

export function displayHeightParts(
  heightCm: number,
  system: BodyUnitSystem,
): { cm: string; feet: string; inches: string } {
  if (system === 'metric') {
    return { cm: String(Math.round(heightCm * 10) / 10), feet: '', inches: '' };
  }
  const { feet, inches } = cmToFeetInches(heightCm);
  return { cm: '', feet: String(feet), inches: String(inches) };
}

export function inputHeightToCm(input: {
  system: BodyUnitSystem;
  cm?: number;
  feet?: number;
  inches?: number;
}): number | null {
  if (input.system === 'metric') {
    const cm = input.cm ?? 0;
    return Number.isFinite(cm) && cm > 0 ? Math.round(cm * 10) / 10 : null;
  }
  const cm = feetInchesToCm(input.feet ?? 0, input.inches ?? 0);
  return cm > 0 ? cm : null;
}

/** Onboarding stored weight in the chosen unit. After body metrics, `current_weight` is kg. */
export function profileWeightKg(input: {
  current_weight?: number | null;
  weight_unit?: WeightUnit | null;
  body_metrics_completed_at?: string | null;
}): number | null {
  const weight = input.current_weight;
  if (weight == null || !Number.isFinite(weight) || weight <= 0) {
    return null;
  }
  if (input.body_metrics_completed_at) {
    return weight;
  }
  return input.weight_unit === 'kg' ? weight : lbToKg(weight);
}

export function hasCompletedBodyMetrics(profile?: { body_metrics_completed_at?: string | null } | null): boolean {
  return Boolean(profile?.body_metrics_completed_at);
}

export function formatProfileWeight(profile: {
  current_weight?: number | null;
  weight_unit?: WeightUnit | null;
  body_metrics_completed_at?: string | null;
}): string {
  const kg = profileWeightKg(profile);
  if (kg == null) {
    return 'Not set';
  }
  const system = unitSystemFromWeightUnit(profile.weight_unit);
  return `${prettyNumber(displayWeight(kg, system))} ${system === 'metric' ? 'kg' : 'lb'}`;
}
