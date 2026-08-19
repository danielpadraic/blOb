export const OFFICIAL_WEEK_10_SLUG = 'week_10';

export const OFFICIAL_JOINABLE_STATUSES = ['filling', 'arming'] as const;
export const OFFICIAL_ACTIVE_STATUSES = ['filling', 'arming', 'live'] as const;

const ALREADY_STARTED = 'This challenge already started.';

export function isOfficialSeriesChallenge(challenge: {
  is_official?: boolean | null;
  series_id?: string | null;
}): boolean {
  return Boolean(challenge.is_official && challenge.series_id);
}

export function isOfficialJoinable(challenge: {
  is_official?: boolean | null;
  series_id?: string | null;
  status?: string | null;
}): boolean {
  const status = String(challenge.status ?? '');
  return isOfficialSeriesChallenge(challenge) && (status === 'filling' || status === 'arming');
}

export function isOfficialLive(challenge: { status?: string | null }): boolean {
  return String(challenge.status ?? '') === 'live';
}

export function officialArmingDeadline(armedAt: string | null | undefined): Date | null {
  if (!armedAt) {
    return null;
  }
  const armed = new Date(armedAt);
  if (Number.isNaN(armed.getTime())) {
    return null;
  }
  return new Date(armed.getTime() + 60 * 60 * 1000);
}

export function armingCountdownLabel(
  armedAt: string | null | undefined,
  now = new Date(),
): string | null {
  const deadline = officialArmingDeadline(armedAt);
  if (!deadline) {
    return null;
  }
  const ms = deadline.getTime() - now.getTime();
  if (ms <= 0) {
    return 'Starts now';
  }
  const totalSec = Math.max(Math.ceil(ms / 1000), 0);
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `Starts in ${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function officialAlreadyStartedCopy(): string {
  return ALREADY_STARTED;
}

export function officialToStartAmount(guarantee: number): number {
  return Math.max(Number(guarantee) || 0, 0) * 1.5;
}
