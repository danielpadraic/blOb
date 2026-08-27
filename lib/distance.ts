import { preferredUnitSystem } from '@/lib/bodyMetrics';

export const METERS_PER_MILE = 1609.34;
export const METERS_PER_KM = 1000;
export const DEFAULT_DISTANCE_MILES = 1;
export const MIN_DISTANCE_STEPS = 0.25;

export type DistanceUnit = 'mi' | 'km';

export function athleteDistanceUnit(
  weightUnit?: string | null,
  preferredUnits?: string | null,
): DistanceUnit {
  return preferredUnitSystem({ weight_unit: weightUnit, preferred_units: preferredUnits }) === 'metric'
    ? 'km'
    : 'mi';
}

export function milesToMeters(miles: number): number {
  return Math.round(Math.max(Number(miles) || 0, 0) * METERS_PER_MILE);
}

export function kmToMeters(km: number): number {
  return Math.round(Math.max(Number(km) || 0, 0) * METERS_PER_KM);
}

export function metersToMiles(meters: number): number {
  return Math.max(Number(meters) || 0, 0) / METERS_PER_MILE;
}

export function metersToKm(meters: number): number {
  return Math.max(Number(meters) || 0, 0) / METERS_PER_KM;
}

export function displayDistance(meters: number, unit: DistanceUnit): number {
  const raw = unit === 'km' ? metersToKm(meters) : metersToMiles(meters);
  return Math.round(raw * 100) / 100;
}

export function formatDistance(meters: number, unit: DistanceUnit = 'mi'): string {
  const n = displayDistance(meters, unit);
  const text = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, '').replace(/\.0$/, '');
  return unit === 'km' ? `${text} km` : `${text} mi`;
}

export function snapDistanceAmount(value: number): number {
  const n = Math.max(Number(value) || 0, 0);
  const snapped = Math.round(n / MIN_DISTANCE_STEPS) * MIN_DISTANCE_STEPS;
  return Math.max(Math.round(snapped * 100) / 100, MIN_DISTANCE_STEPS);
}

export function amountToMeters(amount: number, unit: DistanceUnit): number {
  const snapped = snapDistanceAmount(amount);
  return unit === 'km' ? kmToMeters(snapped) : milesToMeters(snapped);
}

export function parseDistanceText(value: string | null | undefined, unit: DistanceUnit = 'mi'): number | null {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) {
    return null;
  }
  const match = raw.match(/(\d+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  const asKm = /\bkm\b|\bk\b/.test(raw);
  const asMi = /\bmi\b|\bmile/.test(raw);
  if (asKm) {
    return kmToMeters(amount);
  }
  if (asMi) {
    return milesToMeters(amount);
  }
  return amountToMeters(amount, unit);
}

export function distanceProofSentence(meters = milesToMeters(DEFAULT_DISTANCE_MILES), unit: DistanceUnit = 'mi'): string {
  const amount = displayDistance(Math.max(meters, milesToMeters(MIN_DISTANCE_STEPS)), unit);
  const n = amount.toFixed(2);
  return unit === 'km'
    ? `Attach a run or walk of at least ${n} km.`
    : `Attach a run or walk of at least ${n} miles.`;
}

export function distanceShortHint(actualMeters: number, requiredMeters: number, unit: DistanceUnit = 'mi'): string {
  const suffix = unit === 'km' ? 'km' : 'mi';
  return `This run is ${displayDistance(actualMeters, unit).toFixed(2)} ${suffix}. This task needs ${displayDistance(requiredMeters, unit).toFixed(2)} ${suffix}.`;
}
