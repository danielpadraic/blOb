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

/** Official “Guaranteed Prize” is host_budget only. Zero / unset means the setting is off. */
export function officialGuaranteeAmount(challenge: { host_budget?: number | null }): number {
  return Math.max(Number(challenge.host_budget) || 0, 0);
}

export function showsGuaranteedPrize(challenge: { host_budget?: number | null }): boolean {
  return officialGuaranteeAmount(challenge) > 0;
}

export function officialToStartAmount(guarantee: number): number {
  return Math.max(Number(guarantee) || 0, 0) * 1.5;
}

/** Paid joins still needed so pot reaches 1.5× guarantee. */
export function officialContestantsNeeded(input: {
  guarantee: number;
  pot: number;
  buyIn: number;
}): number {
  const guarantee = Math.max(Number(input.guarantee) || 0, 0);
  const pot = Math.max(Number(input.pot) || 0, 0);
  const buyIn = Number(input.buyIn) || 0;
  if (buyIn <= 0) {
    return 0;
  }
  return Math.max(0, Math.ceil((officialToStartAmount(guarantee) - pot) / buyIn));
}

export function officialStartNeededLabel(needed: number): string | null {
  if (needed <= 0) {
    return null;
  }
  if (needed === 1) {
    return '1 more contestant needed';
  }
  return `${needed} more contestants needed`;
}

type OfficialStartRow = {
  id?: string | null;
  is_official?: boolean | null;
  series_id?: string | null;
  status?: string | null;
  min_participants?: number | null;
  participant_count?: number | null;
  host_budget?: number | null;
  prize_pool?: number | null;
  buy_in_amount?: number | null;
};

/** Paid-join target for THIS challenge_id only. Never last-open snapshot. */
export function officialStartJoinTarget(challenge: OfficialStartRow | null | undefined): number {
  if (!challenge?.id || !isOfficialSeriesChallenge(challenge)) {
    return 0;
  }
  const joined = Math.max(Math.floor(Number(challenge.participant_count) || 0), 0);
  const min = Math.max(Math.floor(Number(challenge.min_participants) || 0), 0);
  const extra = officialContestantsNeeded({
    guarantee: officialGuaranteeAmount(challenge),
    pot: Number(challenge.prize_pool) || 0,
    buyIn: Number(challenge.buy_in_amount) || 0,
  });
  return Math.max(min, extra > 0 ? joined + extra : 0);
}

export function officialRemainingToStart(challenge: OfficialStartRow | null | undefined): number {
  const target = officialStartJoinTarget(challenge);
  const joined = Math.max(Math.floor(Number(challenge?.participant_count) || 0), 0);
  return Math.max(target - joined, 0);
}

export function officialFormingStartLine(challenge: OfficialStartRow | null | undefined): string | null {
  if (!challenge?.id || !isOfficialJoinable(challenge) || String(challenge.status) === 'arming') {
    return null;
  }
  const n = officialStartJoinTarget(challenge);
  if (n <= 0) {
    return null;
  }
  return `Starts at midnight Chicago when ${n} have joined.`;
}

