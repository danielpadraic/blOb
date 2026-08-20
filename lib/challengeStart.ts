import type { Challenge } from '@/lib/types';

const DAY_MS = 24 * 60 * 60 * 1000;

export function isUserCreatedChallenge(challenge: {
  is_official?: boolean | null;
  series_id?: string | null;
} | null | undefined): boolean {
  if (!challenge) {
    return false;
  }
  return !challenge.is_official && !challenge.series_id;
}

export function isChallengeLive(status: string | null | undefined): boolean {
  return String(status ?? '') === 'live';
}

export function canHostQuickEdit(input: {
  challenge: Pick<Challenge, 'status' | 'created_by' | 'is_official' | 'series_id'> | null | undefined;
  viewerId?: string | null;
}): boolean {
  const challenge = input.challenge;
  if (!challenge || !input.viewerId || challenge.created_by !== input.viewerId) {
    return false;
  }
  if (!isUserCreatedChallenge(challenge)) {
    return false;
  }
  const status = String(challenge.status ?? '');
  return (
    status !== 'live' &&
    status !== 'judging' &&
    status !== 'settled' &&
    status !== 'cancelled' &&
    status !== 'cancelled_underfilled' &&
    status !== 'distributing'
  );
}

export function startRollKeepDays(challenge: {
  start_roll_keep_days?: number | null;
  length_value?: number | null;
  days_required?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
}): number {
  const stored = Math.floor(Number(challenge.start_roll_keep_days) || 0);
  if (stored > 0) {
    return stored;
  }
  if (challenge.starts_at && challenge.ends_at) {
    const start = new Date(challenge.starts_at).getTime();
    const end = new Date(challenge.ends_at).getTime();
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      return Math.max(1, Math.ceil((end - start) / DAY_MS));
    }
  }
  return Math.max(1, Math.floor(Number(challenge.length_value ?? challenge.days_required) || 1));
}

export function canShortenStartRoll(challenge: {
  ends_at?: string | null;
  starts_at?: string | null;
  is_unlimited?: boolean | null;
}): boolean {
  if (challenge.is_unlimited || !challenge.ends_at || !challenge.starts_at) {
    return false;
  }
  const start = new Date(challenge.starts_at).getTime();
  const end = new Date(challenge.ends_at).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return false;
  }
  return end - start >= DAY_MS;
}

export function formatStartMovedDate(iso: string | null | undefined, timeZone?: string | null): string {
  if (!iso) {
    return '';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: timeZone || undefined,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
  }
}

export function startMovedBody(challenge: {
  starts_at?: string | null;
  timezone?: string | null;
}): string {
  const when = formatStartMovedDate(challenge.starts_at, challenge.timezone);
  return when ? `Not enough people yet. Start moved to ${when}.` : 'Not enough people yet. Start moved.';
}
