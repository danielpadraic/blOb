import { athleteDistanceUnit, formatDistance } from '@/lib/distance';
import { formatHealthDuration } from '@/lib/health/durationChip';
import type { HealthConfidence } from '@/services/health/types';

export { formatHealthDuration } from '@/lib/health/durationChip';

export function healthSourceLabel(confidence: string | null | undefined): string {
  if (confidence === 'watch') {
    return 'Apple Watch';
  }
  if (confidence === 'phone') {
    return 'iPhone';
  }
  return 'Health';
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
  const duration = formatHealthDuration(input.durationSec);
  const primary = [miles ?? input.activityLabel, duration, healthSourceLabel(input.confidence)]
    .filter(Boolean)
    .join(' · ');
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
