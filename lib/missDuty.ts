import { isOfficialSeriesChallenge } from '@/lib/officialSeries';

export type MissDutyChallenge = {
  is_official?: boolean | null;
  series_id?: string | null;
  challenge_type?: string | null;
  format?: string | null;
  frequency?: string | null;
  target_count?: number | null;
  days_required?: number | null;
  length_value?: number | null;
};

/**
 * True only when this challenge required a check-in on a specific calendar
 * period (daily consistency, Official week, miss=out daily).
 * Weekly / monthly / N-per-week / points / totals do not.
 */
export function challengeHasDailyCheckinDuty(
  challenge?: MissDutyChallenge | null,
): boolean {
  if (!challenge) {
    return false;
  }
  if (isOfficialSeriesChallenge(challenge)) {
    return true;
  }
  const type = String(challenge.challenge_type ?? '').toLowerCase();
  const format = String(challenge.format ?? 'consistency').toLowerCase();
  if (type === 'points' || type === 'cumulative' || format === 'cumulative' || format === 'points') {
    return false;
  }
  const freq = String(challenge.frequency ?? 'daily').toLowerCase();
  if (
    freq === 'weekly' ||
    freq === 'week' ||
    freq === 'monthly' ||
    freq === 'month' ||
    freq === 'once' ||
    freq === 'custom' ||
    freq === '3x_week'
  ) {
    return false;
  }
  if (freq !== 'daily' && freq !== 'day') {
    return false;
  }
  return type === '' || type === 'consistency' || format === 'consistency';
}
