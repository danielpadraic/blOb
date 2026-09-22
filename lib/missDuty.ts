import { usesQuantityScoring } from '@/lib/challengeExperience';
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
  allowed_misses?: number | null;
  max_misses?: number | null;
  consistency?: { misses?: number | null } | null;
  metrics?: unknown;
  scoring_config?: unknown;
  cumulative_target?: number | string | null;
  title?: string | null;
  task?: string | null;
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
  if (usesQuantityScoring(challenge)) {
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
  const raw =
    challenge?.misses_allowed ??
    challenge?.allowed_misses ??
    challenge?.max_misses ??
    challenge?.consistency?.misses;
  return Math.max(Math.trunc(Number(raw) || 0), 0);
}

export function missesAllowedCopy(allowed: number): string {
  if (allowed <= 0) {
    return 'miss a required check-in and you are out.';
  }
  return `Misses allowed: ${allowed}`;
}

export function missesUsedCopy(used: number): string {
  return `Misses used: ${Math.max(Math.trunc(used) || 0, 0)}`;
}

/** How many excuses (or counted days) are still needed to be back in. Never negative. */
export function missesOver(input: {
  missedPeriods: number;
  allowedMisses: number;
  excused?: number;
}): number {
  const missed = Math.max(Math.trunc(Number(input.missedPeriods) || 0), 0);
  const allowed = Math.max(Math.trunc(Number(input.allowedMisses) || 0), 0);
  const excused = Math.max(Math.trunc(Number(input.excused) || 0), 0);
  return Math.max(0, missed - allowed - excused);
}

export function excuseOverConfirmLine(name: string, over: number): string {
  const who = String(name ?? '').trim() || 'Someone';
  const n = Math.max(Math.trunc(Number(over) || 0), 0);
  if (n <= 0) {
    return `${who} is still in. This excuse is extra room, not required.`;
  }
  if (n === 1) {
    return `${who} is 1 miss over. Excuse this miss or Count that day to put them back in.`;
  }
  return `${who} is ${n} misses over. Excuse ${n} more to put them back in, or Count the missing day.`;
}

export function viewerMissesOverLine(over: number): string {
  const n = Math.max(Math.trunc(Number(over) || 0), 0);
  if (n <= 1) {
    return 'You’re 1 miss over. A host can excuse 1 or count a missed day.';
  }
  return `You’re ${n} misses over. A host can excuse ${n} or count a missed day.`;
}
