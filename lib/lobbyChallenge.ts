import { format, isSameDay } from 'date-fns';

import { isSubmittedCheckin } from '@/lib/challengeCheckin';
import { checkinPeriodKeyCandidates, normalizePeriodKey, type CheckinPeriodChallenge } from '@/lib/checkinPeriod';
import { isOfficialChallenge } from '@/lib/official';
import {
  armingCountdownLabel,
  isOfficialSeriesChallenge,
  officialContestantsNeeded,
  officialGuaranteeAmount,
} from '@/lib/officialSeries';
import { authStorage } from '@/lib/utils/secureStore';

export const LOBBY_LAYOUT_KEY = 'blob.lobby-layout';
export const LOBBY_UNCHECKED_KEY = 'blob.lobby-unchecked-today';

export type LobbyTab = 'official' | 'active' | 'hosting';
export type LobbyLayout = 'card' | 'list';

export type ChallengeEndMeta = {
  datetime: string | null;
  countdown: string | null;
  urgent: boolean;
};

export type ChallengeSchedulePhase = 'prestart' | 'live' | 'ended' | 'settled';

export type ChallengeScheduleState = {
  phase: ChallengeSchedulePhase;
  datetime: string | null;
  chip: string | null;
  gate: string | null;
  countdown: string | null;
  urgent: boolean;
};

export type ScheduleChallenge = {
  status?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  is_unlimited?: boolean | null;
  start_rule?: string | null;
  start_mode?: string | null;
  start_within_value?: number | null;
  start_within_unit?: string | null;
  armed_at?: string | null;
  min_participants?: number | null;
  participant_count?: number | null;
  is_official?: boolean | null;
  series_id?: string | null;
  buy_in_amount?: number | null;
  prize_pool?: number | null;
  host_budget?: number | null;
  creator_contribution?: number | null;
  distributed_at?: string | null;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Participant for Lobby Active: anything except withdrawn / refunded. */
export function isLobbyActiveParticipantStatus(status: string | null | undefined): boolean {
  const value = String(status ?? 'joined').toLowerCase();
  return value !== 'withdrawn' && value !== 'refunded' && value !== 'refunded_pre_start';
}

export function lobbyTabForChallenge(input: {
  isOfficial?: boolean | null;
  isParticipant: boolean;
  isCreator: boolean;
}): LobbyTab {
  if (input.isOfficial) {
    return 'official';
  }
  if (input.isParticipant) {
    return 'active';
  }
  if (input.isCreator) {
    return 'hosting';
  }
  return 'active';
}

export function sortEndingSoonest<T extends { ends_at?: string | null; is_unlimited?: boolean | null }>(
  rows: T[],
): T[] {
  return [...rows].sort((a, b) => {
    const aTime = endSortTime(a);
    const bTime = endSortTime(b);
    if (aTime !== bTime) {
      return aTime - bTime;
    }
    return 0;
  });
}

function endSortTime(row: { ends_at?: string | null; is_unlimited?: boolean | null }): number {
  if (row.is_unlimited || !row.ends_at) {
    return Number.POSITIVE_INFINITY;
  }
  const time = Date.parse(row.ends_at);
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

export function pad2(value: number): string {
  return String(Math.max(0, Math.floor(value))).padStart(2, '0');
}

/** Live clock: mm:ss under an hour, h:mm under a day. */
export function formatEndCountdown(remainingMs: number): string {
  const ms = Math.max(remainingMs, 0);
  if (ms <= HOUR_MS) {
    const totalSec = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    return `${minutes}:${pad2(seconds)}`;
  }
  const totalMin = Math.floor(ms / 60000);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  return `${hours}:${pad2(minutes)}`;
}

export function challengeEndMeta(
  endsAt?: string | null,
  nowMs = Date.now(),
  unlimited?: boolean | null,
): ChallengeEndMeta {
  if (unlimited || !endsAt) {
    return { datetime: null, countdown: null, urgent: false };
  }
  const end = new Date(endsAt);
  if (Number.isNaN(end.getTime())) {
    return { datetime: null, countdown: null, urgent: false };
  }
  const datetime = `Ends ${format(end, 'MMM d')} · ${format(end, 'h:mm a')}`;
  const remaining = end.getTime() - nowMs;
  if (remaining <= 0) {
    return { datetime, countdown: 'Ended', urgent: false };
  }
  if (remaining > DAY_MS) {
    return { datetime, countdown: null, urgent: false };
  }
  return {
    datetime,
    countdown: formatEndCountdown(remaining),
    urgent: remaining <= HOUR_MS,
  };
}

const PRESTART_STATUSES = new Set(['upcoming', 'open', 'filling', 'arming']);
const LIVE_STATUSES = new Set(['live', 'in_progress']);
const SETTLED_STATUSES = new Set(['settled']);
const ENDED_STATUSES = new Set(['ended', 'settling', 'judging', 'distributing', 'cancelled', 'cancelled_underfilled']);

function parseInstant(value?: string | null): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isNextLocalMorning(startsAt: Date, now = new Date()): boolean {
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  return isSameDay(startsAt, tomorrow) && startsAt.getHours() < 12;
}

export function formatStartsLine(startsAt?: string | null, nowMs = Date.now()): string | null {
  const start = parseInstant(startsAt);
  if (!start) {
    return null;
  }
  const now = new Date(nowMs);
  if (isNextLocalMorning(start, now)) {
    return `Starts Tomorrow ${format(start, 'h:mm a')}`;
  }
  return `Starts ${format(start, 'MMM d')} · ${format(start, 'h:mm a')}`;
}

function isStartAfterFill(challenge: ScheduleChallenge): boolean {
  const mode = String(challenge.start_mode ?? '').toLowerCase();
  const rule = String(challenge.start_rule ?? '').toLowerCase();
  if (mode === 'full_lobby' || mode === 'all_ready') {
    return true;
  }
  if (rule === 'full_lobby' || rule === 'all_ready') {
    return true;
  }
  return isOfficialSeriesChallenge(challenge) || Boolean(challenge.is_official && challenge.series_id);
}

function isOneHourArm(challenge: ScheduleChallenge): boolean {
  if (String(challenge.status ?? '') === 'arming' || challenge.armed_at) {
    return true;
  }
  const unit = String(challenge.start_within_unit ?? '').toLowerCase();
  const value = Number(challenge.start_within_value);
  return (unit === 'hour' || unit === 'hours') && value === 1;
}

function fillNeededMin(challenge: ScheduleChallenge): number {
  const count = Math.max(Number(challenge.participant_count) || 0, 0);
  let min = Math.max(Number(challenge.min_participants) || 0, 0);
  if (isOfficialChallenge(challenge) || isOfficialSeriesChallenge(challenge)) {
    const guarantee = officialGuaranteeAmount(challenge);
    const pot = Math.max(Number(challenge.prize_pool) || 0, 0);
    const buyIn = Math.max(Number(challenge.buy_in_amount) || 0, 0);
    const extra = officialContestantsNeeded({ guarantee, pot, buyIn });
    if (extra > 0) {
      min = Math.max(min, count + extra);
    }
  }
  return min;
}

export function fillGateLabel(challenge: ScheduleChallenge): string | null {
  const count = Math.max(Number(challenge.participant_count) || 0, 0);
  const min = fillNeededMin(challenge);
  if (min <= 0 || count >= min) {
    return null;
  }
  if (min - count === 1) {
    return '1 more person needed';
  }
  return `${count}/${min} needed to begin`;
}

export function automationChip(
  challenge: ScheduleChallenge,
  nowMs = Date.now(),
): string | null {
  const status = String(challenge.status ?? '');
  if (status === 'arming' || challenge.armed_at) {
    return armingCountdownLabel(challenge.armed_at, new Date(nowMs)) ?? 'Starts in 1 hour';
  }
  if (isStartAfterFill(challenge) || isOneHourArm(challenge)) {
    return 'Starts in 1 hour';
  }
  const start = parseInstant(challenge.starts_at);
  if (start && isNextLocalMorning(start, new Date(nowMs))) {
    return 'Tomorrow morning';
  }
  return null;
}

export function schedulePhase(
  challenge: ScheduleChallenge,
  nowMs = Date.now(),
): ChallengeSchedulePhase {
  const status = String(challenge.status ?? '');
  if (SETTLED_STATUSES.has(status)) {
    return 'settled';
  }
  if (ENDED_STATUSES.has(status)) {
    return 'ended';
  }
  if (LIVE_STATUSES.has(status)) {
    return 'live';
  }
  const start = parseInstant(challenge.starts_at);
  if (PRESTART_STATUSES.has(status) || (start && start.getTime() > nowMs)) {
    return 'prestart';
  }
  const end = parseInstant(challenge.ends_at);
  if (end && end.getTime() <= nowMs && !challenge.is_unlimited) {
    return 'ended';
  }
  return 'live';
}

function endedDatetime(challenge: ScheduleChallenge, label: 'Ended' | 'Settled'): string | null {
  const at = parseInstant(challenge.ends_at) ?? parseInstant(challenge.distributed_at);
  if (!at) {
    return label;
  }
  return `${label} ${format(at, 'MMM d')} · ${format(at, 'h:mm a')}`;
}

export function challengeScheduleState(
  challenge: ScheduleChallenge,
  nowMs = Date.now(),
): ChallengeScheduleState {
  const phase = schedulePhase(challenge, nowMs);
  if (phase === 'prestart') {
    const datetime = formatStartsLine(challenge.starts_at, nowMs) ?? 'Starts soon';
    const chip = automationChip(challenge, nowMs);
    return {
      phase,
      datetime,
      chip: chip && chip !== datetime ? chip : null,
      gate: fillGateLabel(challenge),
      countdown: null,
      urgent: false,
    };
  }
  if (phase === 'live') {
    const end = challengeEndMeta(challenge.ends_at, nowMs, challenge.is_unlimited);
    return {
      phase,
      datetime: end.datetime,
      chip: null,
      gate: null,
      countdown: end.countdown,
      urgent: end.urgent,
    };
  }
  return {
    phase,
    datetime: endedDatetime(challenge, phase === 'settled' ? 'Settled' : 'Ended'),
    chip: null,
    gate: null,
    countdown: null,
    urgent: false,
  };
}

export function scheduleNeedsTick(challenge: ScheduleChallenge, nowMs = Date.now()): boolean {
  const state = challengeScheduleState(challenge, nowMs);
  if (state.phase === 'prestart') {
    return String(challenge.status ?? '') === 'arming' || Boolean(challenge.armed_at);
  }
  if (state.phase === 'live' && state.countdown) {
    return true;
  }
  return false;
}

export function checkedInForCurrentPeriod(
  row: { status?: string | null; submitted_at?: string | null; period_key?: unknown } | null | undefined,
  challenge?: CheckinPeriodChallenge | null,
): boolean {
  if (!isSubmittedCheckin(row)) {
    return false;
  }
  const key = normalizePeriodKey(row.period_key);
  return Boolean(key && checkinPeriodKeyCandidates(challenge).includes(key));
}

export async function loadLobbyLayout(): Promise<LobbyLayout> {
  const raw = await authStorage.getItem(LOBBY_LAYOUT_KEY);
  return raw === 'list' ? 'list' : 'card';
}

export async function saveLobbyLayout(layout: LobbyLayout): Promise<void> {
  await authStorage.setItem(LOBBY_LAYOUT_KEY, layout);
}

export async function loadLobbyUncheckedFilter(): Promise<boolean> {
  const raw = await authStorage.getItem(LOBBY_UNCHECKED_KEY);
  return raw !== '0';
}

export async function saveLobbyUncheckedFilter(on: boolean): Promise<void> {
  await authStorage.setItem(LOBBY_UNCHECKED_KEY, on ? '1' : '0');
}

export function isOfficialLobbyRow(row: { is_official?: boolean | null }): boolean {
  return isOfficialChallenge(row);
}
