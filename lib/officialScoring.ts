import { dateStampInZone, officialWindowsFor } from '@/lib/officialDays';
import { isOfficialAccount } from '@/lib/official';
import { isOfficialSeriesChallenge } from '@/lib/officialSeries';
import { challengeClockTz } from '@/lib/checkinPeriod';
import {
  comparablePointsFromChallenge,
  currentScoringVersion,
} from '@/lib/comparablePoints';
import type { Challenge, Profile } from '@/lib/types';

const CLOSED = new Set([
  'settled',
  'cancelled',
  'cancelled_underfilled',
  'distributing',
]);

export function canEditOfficialScoring(input: {
  challenge?: Pick<Challenge, 'created_by' | 'status'> | null;
  viewerId?: string | null;
  profile?: Pick<Profile, 'id' | 'is_official' | 'is_admin' | 'username'> | null;
}): boolean {
  const challenge = input.challenge;
  if (!challenge || !input.viewerId) {
    return false;
  }
  if (CLOSED.has(String(challenge.status ?? ''))) {
    return false;
  }
  if (challenge.created_by === input.viewerId) {
    return true;
  }
  return isOfficialAccount(input.profile);
}

export function canOpenOfficialTools(input: {
  challenge?: Pick<Challenge, 'created_by' | 'status' | 'is_official'> | null;
  viewerId?: string | null;
  profile?: Pick<Profile, 'id' | 'is_official' | 'is_admin' | 'username'> | null;
}): boolean {
  return canEditOfficialScoring(input);
}

export function isOfficialOrCorporateDetails(
  challenge?: Pick<Challenge, 'is_official' | 'privacy_mode'> | null,
): boolean {
  return Boolean(challenge?.is_official) || challenge?.privacy_mode === 'private_corporate';
}

export function canEditOfficialDetails(input: {
  challenge?: Pick<Challenge, 'created_by' | 'status' | 'is_official' | 'privacy_mode'> | null;
  viewerId?: string | null;
  profile?: Pick<Profile, 'id' | 'is_official' | 'is_admin' | 'username'> | null;
}): boolean {
  if (!isOfficialOrCorporateDetails(input.challenge)) {
    return false;
  }
  return canEditOfficialScoring(input);
}

export function scoringChangeEffectiveLine(
  challenge: Pick<
    Challenge,
    'is_official' | 'series_id' | 'timezone' | 'starts_at' | 'days_required' | 'target_count' | 'day_windows' | 'status'
  > | null | undefined,
  now = new Date(),
): string {
  if (!challenge) {
    return 'Changes begin with the next challenge day.';
  }
  if (isOfficialSeriesChallenge(challenge)) {
    const next = officialWindowsFor(challenge).find((window) => window.startsAt.getTime() > now.getTime());
    if (next) {
      return `Takes effect on Official day ${next.day} (${next.date}).`;
    }
    return 'Takes effect on the next Official day.';
  }
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const stamp = dateStampInZone(tomorrow, challengeClockTz(challenge));
  return `Takes effect on the next challenge day (${stamp}).`;
}

export function officialScoringStatusLine(challenge: {
  scoring_version?: number | null;
  comparable_points_config?: unknown;
  scoring_config?: unknown;
} | null | undefined): string {
  if (!comparablePointsFromChallenge(challenge)) {
    return 'No Comparable Points method yet.';
  }
  return `Version ${currentScoringVersion(challenge)} · ACTIVE`;
}
