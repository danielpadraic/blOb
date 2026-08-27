import { athleteDistanceUnit, formatDistance } from '@/lib/distance';
import type { HealthConfidence } from '@/services/health/types';

export function healthSourceLabel(confidence: string | null | undefined): string {
  if (confidence === 'watch') {
    return 'Apple Watch';
  }
  if (confidence === 'phone') {
    return 'iPhone';
  }
  return 'Health';
}

export function formatHealthDuration(sec: number): string {
  const minutes = Math.max(1, Math.round(sec / 60));
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function healthProofLines(input: {
  activityLabel: string;
  durationSec: number;
  confidence?: HealthConfidence | string | null;
  hrAvg?: number | null;
  caloriesKcal?: number | null;
  distanceMeters?: number | null;
  hasRoute?: boolean;
}): { primary: string; secondary: string | null } {
  const miles =
    Number(input.distanceMeters) > 0 ? formatDistance(Number(input.distanceMeters), athleteDistanceUnit()) : null;
  const primary = miles
    ? `${miles} · ${formatHealthDuration(input.durationSec)} · ${healthSourceLabel(input.confidence)}`
    : `${input.activityLabel} · ${formatHealthDuration(input.durationSec)} · ${healthSourceLabel(input.confidence)}`;
  const bits: string[] = [];
  if (miles && input.hasRoute === false) {
    bits.push('No route on this workout.');
  }
  if (input.hrAvg && input.hrAvg > 0) {
    bits.push(`Average heart rate ${Math.round(input.hrAvg)}`);
  }
  if (input.caloriesKcal && input.caloriesKcal > 0) {
    bits.push(`${Math.round(input.caloriesKcal)} cal`);
  }
  return { primary, secondary: bits.length > 0 ? bits.join(' · ') : null };
}
