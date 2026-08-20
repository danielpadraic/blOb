import {
  differenceInCalendarDays,
  differenceInHours,
  differenceInMinutes,
  format,
  formatDistanceToNowStrict,
  isAfter,
  isBefore,
  isSameDay,
} from 'date-fns';

import { armingCountdownLabel } from '@/lib/officialSeries';

export function formatCoins(amount: number | null | undefined): string {
  const value = Number(amount ?? 0);
  return `${value.toFixed(2)} Coins`;
}

export function formatBucks(amount: number | null | undefined): string {
  const value = Number(amount ?? 0);
  return `$${value.toFixed(2)}`;
}

export function formatUsd(amount: number | null | undefined): string {
  const value = Number(amount ?? 0);
  return `$${value.toFixed(2)} USD`;
}

export function formatCredits(amount: number | null | undefined): string {
  return formatCoins(amount);
}

export function formatMoney(amount: number | null | undefined): string {
  return formatCredits(amount);
}

export function estimatedShare(
  prizePool: number,
  participantCount: number,
): number | null {
  if (participantCount <= 0) {
    return null;
  }
  return Number(prizePool) / participantCount;
}

export function estimatedShareLabel(
  prizePool: number,
  participantCount: number,
): string {
  const share = estimatedShare(prizePool, participantCount);
  if (share == null) {
    return 'Waiting for competitors';
  }
  return formatCoins(share);
}

export function formatParticipantCount(count: number): string {
  if (count <= 0) {
    return '0';
  }
  return String(count);
}

/** Equal-split estimate if every current competitor (plus you, if needed) finishes. */
export function prizeIfYouFinish(input: {
  prizePool: number;
  buyIn: number;
  participantCount: number;
  alreadyJoined: boolean;
}): { share: number; assumedFinishers: number; pool: number } {
  const assumedFinishers = input.alreadyJoined
    ? Math.max(input.participantCount, 1)
    : input.participantCount + 1;
  const pool = input.alreadyJoined
    ? Number(input.prizePool)
    : Number(input.prizePool) + Number(input.buyIn);
  return {
    share: pool / assumedFinishers,
    assumedFinishers,
    pool,
  };
}

export function formatRelative(date: string | Date): string {
  return formatDistanceToNowStrict(new Date(date), { addSuffix: true });
}

/** Compact feed timestamps: 2h, 3h, Yesterday. */
export function formatFeedTime(date: string | Date): string {
  const then = new Date(date);
  if (Number.isNaN(then.getTime())) {
    return '';
  }
  const now = new Date();
  const minutes = Math.max(differenceInMinutes(now, then), 0);
  if (minutes < 1) {
    return 'now';
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = differenceInHours(now, then);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = differenceInCalendarDays(now, then);
  if (days === 1) {
    return 'Yesterday';
  }
  if (days < 7) {
    return `${days}d`;
  }
  if (then.getFullYear() === now.getFullYear()) {
    return format(then, 'MMM d');
  }
  return format(then, 'MMM d, yyyy');
}

export function formatDate(date: string | Date, pattern = 'MMM d'): string {
  return format(new Date(date), pattern);
}

export function formatDateRange(startsAt: string, endsAt: string | null | undefined): string {
  if (!endsAt) {
    return `Started ${formatDate(startsAt, 'MMM d')} · ongoing`;
  }
  return `${formatDate(startsAt, 'MMM d')} – ${formatDate(endsAt, 'MMM d')}`;
}

export function challengeWindowDays(startsAt: string, endsAt: string | null | undefined): number {
  if (!endsAt) {
    return 0;
  }
  return Math.max(differenceInCalendarDays(new Date(endsAt), new Date(startsAt)), 1);
}

export function challengeWindowLabel(startsAt: string, endsAt: string): string {
  const now = new Date();
  if (isBefore(now, new Date(startsAt))) {
    return `Starts ${formatRelative(startsAt)}`;
  }
  if (isAfter(now, new Date(endsAt))) {
    return 'Ended';
  }
  return `Ends ${formatRelative(endsAt)}`;
}

export function challengeTimingLabel(
  startsAt: string,
  endsAt: string | null | undefined,
  unlimited?: boolean,
): string {
  return lobbyTimeLabel({
    starts_at: startsAt,
    ends_at: endsAt ?? null,
    is_unlimited: unlimited,
  });
}

export function compactCountdown(target: Date, now: Date): string {
  const minutes = Math.max(differenceInMinutes(target, now), 0);
  if (minutes < 60) {
    return minutes <= 0 ? 'now' : `${minutes}m`;
  }
  const hours = differenceInHours(target, now);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.max(differenceInCalendarDays(target, now), 1);
  return `${days}d`;
}

function lobbyWaitOrStartLabel(challenge: {
  starts_at?: string | null;
  start_mode?: string | null;
  min_participants?: number | null;
  status?: string | null;
  armed_at?: string | null;
}): string | null {
  const status = String(challenge.status ?? '');
  if (status === 'filling') {
    return null;
  }
  if (status === 'arming') {
    return armingCountdownLabel(challenge.armed_at) ?? 'Starts soon';
  }
  const mode = String(challenge.start_mode ?? '');
  if (mode === 'full_lobby' || mode === 'all_ready') {
    const min = Math.max(Number(challenge.min_participants) || 0, 0);
    if (min > 1) {
      return `Min ${min} to start`;
    }
    return 'Waits for players';
  }
  const now = new Date();
  const start = new Date(challenge.starts_at ?? '');
  if (Number.isNaN(start.getTime()) || !isBefore(now, start)) {
    return null;
  }
  if (isSameDay(now, start)) {
    return 'Starts today';
  }
  const countdown = compactCountdown(start, now);
  return countdown === 'now' ? 'Starts soon' : `Starts in ${countdown}`;
}

/** Open-card TIME: start/wait copy only. Never "Ends in …". */
export function lobbyDiscoverTimeLabel(challenge: {
  starts_at?: string | null;
  start_mode?: string | null;
  min_participants?: number | null;
  official_started_at?: string | null;
  status?: string | null;
  armed_at?: string | null;
}): string | null {
  if (
    challenge.official_started_at ||
    challenge.status === 'in_progress' ||
    challenge.status === 'live'
  ) {
    return null;
  }
  return lobbyWaitOrStartLabel(challenge);
}

/** Joined-card TIME: countdown, wait-for-players, or days left. */
export function lobbyTimeLabel(challenge: {
  starts_at?: string | null;
  ends_at?: string | null;
  is_unlimited?: boolean | null;
  start_mode?: string | null;
  min_participants?: number | null;
  official_started_at?: string | null;
  status?: string | null;
  armed_at?: string | null;
}): string {
  const status = String(challenge.status ?? '');
  if (status === 'filling') {
    return '';
  }
  if (status === 'arming') {
    return armingCountdownLabel(challenge.armed_at) ?? 'Starts soon';
  }
  const startCopy = lobbyWaitOrStartLabel(challenge);
  const hasStarted =
    Boolean(challenge.official_started_at) ||
    status === 'in_progress' ||
    status === 'live' ||
    !startCopy;

  if (!hasStarted && startCopy) {
    return startCopy;
  }

  if (challenge.is_unlimited || !challenge.ends_at) {
    return status === 'filling' || status === 'arming' ? '' : 'Ongoing';
  }
  const now = new Date();
  const end = new Date(challenge.ends_at);
  if (Number.isNaN(end.getTime()) || !isBefore(now, end)) {
    return 'Ended';
  }
  return `Ends in ${compactCountdown(end, now)}`;
}

export function lobbyPlayersLabel(challenge: {
  participant_count?: number | null;
  max_participants?: number | null;
  is_unlimited?: boolean | null;
}): string {
  const joined = Math.max(Number(challenge.participant_count) || 0, 0);
  const max = Number(challenge.max_participants);
  if (
    challenge.is_unlimited ||
    challenge.max_participants == null ||
    !Number.isFinite(max) ||
    max <= 0
  ) {
    return `${joined}/Unlimited`;
  }
  return `${joined}/${max}`;
}

export function lobbyDurationLabel(challenge: {
  starts_at: string;
  ends_at: string | null | undefined;
  is_unlimited?: boolean | null;
  days_required?: number | null;
  length_value?: number | null;
  length_unit?: string | null;
}): string {
  if (challenge.is_unlimited) {
    return 'Ongoing';
  }
  if (challenge.ends_at) {
    const days = challengeWindowDays(challenge.starts_at, challenge.ends_at);
    if (days > 0) {
      return `${days} day${days === 1 ? '' : 's'}`;
    }
  }
  const length = Number(challenge.length_value ?? 0);
  const unit = String(challenge.length_unit ?? '');
  if (length > 0 && unit) {
    if (unit.startsWith('week')) {
      return `${length} week${length === 1 ? '' : 's'}`;
    }
    if (unit.startsWith('month')) {
      return `${length} month${length === 1 ? '' : 's'}`;
    }
    if (unit.startsWith('year')) {
      return `${length} year${length === 1 ? '' : 's'}`;
    }
    return `${length} day${length === 1 ? '' : 's'}`;
  }
  const required = Number(challenge.days_required ?? 0);
  if (required > 0) {
    return `${required} day${required === 1 ? '' : 's'}`;
  }
  return 'Ongoing';
}

export function initials(name: string | null | undefined): string {
  const source = (name ?? '').trim();
  if (!source) {
    return 'b';
  }
  const parts = source.split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('') || 'b';
}
