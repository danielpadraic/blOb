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
  is_unlimited?: boolean | null;
  end_mode?: string | null;
  misses_allowed?: number | null;
};

function asKey(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export function challengeIsUnlimitedMiss(challenge?: MissDutyChallenge | null): boolean {
  if (!challenge) {
    return false;
  }
  return Boolean(challenge.is_unlimited) || asKey(challenge.end_mode) === 'indefinite_lms';
}

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

/** Miss cap only when this format records required-period misses. */
export function challengeShowsMissBudget(challenge?: MissDutyChallenge | null): boolean {
  return Boolean(challenge) && challengeHasDailyCheckinDuty(challenge) && !challengeIsUnlimitedMiss(challenge);
}

export function missesAllowedCap(challenge?: MissDutyChallenge | null): number | null {
  if (!challengeShowsMissBudget(challenge)) {
    return null;
  }
  return Math.max(Math.trunc(Number(challenge?.misses_allowed) || 0), 0);
}

export function missesAllowedCopy(allowed: number): string {
  if (allowed <= 0) {
    return 'Misses allowed: 0 — miss a required check-in and you are out.';
  }
  return `Misses allowed: ${allowed}`;
}

export function missesUsedCopy(used: number): string {
  return `Misses used: ${Math.max(Math.trunc(used) || 0, 0)}`;
}
