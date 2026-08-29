import { format, isSameDay } from 'date-fns';

import { usesComparablePointsScoring } from '@/lib/challengeExperience';
import { isSubmittedCheckin } from '@/lib/challengeCheckin';
import { checkinPeriodKeyCandidates, normalizePeriodKey, type CheckinPeriodChallenge } from '@/lib/checkinPeriod';
import { ENDED_LOBBY_STATUSES } from '@/lib/constants';
import { challengeCurrency } from '@/lib/currency';
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
export const LOBBY_FILTERS_KEY = 'blob.lobby.filters.v1';

export const LOBBY_TAB_VALUES = ['official', 'active', 'hosting', 'ended'] as const;
export type LobbyTab = (typeof LOBBY_TAB_VALUES)[number];
export type LobbyLayout = 'card' | 'list';

export type LobbyWhen = 'day' | 'week' | '30d' | 'year' | 'all' | 'custom';
export type LobbyStart = 'started' | 'tomorrow' | 'next7' | 'next30' | 'custom';
export type LobbyDuration = '1-7' | '8-30' | '31+' | 'custom';
export type LobbyTypeFilter = 'consistency' | 'points' | 'official_weekly';
export type LobbyCurrencyFilter = 'coins' | 'bucks' | 'free';
export type LobbyCostFilter = 'free' | 'host_funded' | 'buy_in';
export type LobbyMoreFilter = 'friends' | 'spots_left';
export type LobbySort =
  | 'ending_soonest'
  | 'starting_soonest'
  | 'newest'
  | 'prize_desc'
  | 'title'
  | 'ended_recently';

export type LobbyFilterState = {
  when: LobbyWhen;
  customFrom: string | null;
  customTo: string | null;
  start: LobbyStart | null;
  startFrom: string | null;
  startTo: string | null;
  durations: LobbyDuration[];
  durationMin: number | null;
  durationMax: number | null;
  types: LobbyTypeFilter[];
  currencies: LobbyCurrencyFilter[];
  costs: LobbyCostFilter[];
  costMin: number | null;
  costMax: number | null;
  statuses: string[];
  more: LobbyMoreFilter[];
};

export type LobbyTabPrefs = {
  filters: LobbyFilterState;
  sort: LobbySort;
};

export type LobbyFilterStore = Record<LobbyTab, LobbyTabPrefs>;

export type LobbyFilterChip = {
  id: string;
  label: string;
};

export type LobbyFilterable = {
  id: string;
  status?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  distributed_at?: string | null;
  created_at?: string | null;
  days_required?: number | null;
  length_value?: number | null;
  length_unit?: string | null;
  challenge_type?: string | null;
  scoring_method?: string | null;
  comparable_points_config?: unknown;
  scoring_config?: unknown;
  is_official?: boolean | null;
  series_id?: string | null;
  currency?: string | null;
  buy_in_amount?: number | null;
  host_funded?: boolean | null;
  host_budget?: number | null;
  creator_contribution?: number | null;
  funding_model?: string | null;
  prize_pool?: number | null;
  max_participants?: number | null;
  participant_count?: number | null;
  is_unlimited?: boolean | null;
  title?: string | null;
};

export type LobbyFilterContext = {
  nowMs: number;
  checkedToday?: Set<string>;
  friendCounts?: Map<string, number>;
};

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

export function isEndedLobbyStatus(status: string | null | undefined): boolean {
  return (ENDED_LOBBY_STATUSES as readonly string[]).includes(status ?? '');
}

export function lobbyTabForChallenge(input: {
  status?: string | null;
  isOfficial?: boolean | null;
  isParticipant: boolean;
  isCreator: boolean;
}): LobbyTab {
  if (isEndedLobbyStatus(input.status)) {
    return 'ended';
  }
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

export function defaultFiltersForTab(tab: LobbyTab): LobbyFilterState {
  return {
    when: tab === 'ended' ? '30d' : 'all',
    customFrom: null,
    customTo: null,
    start: null,
    startFrom: null,
    startTo: null,
    durations: [],
    durationMin: null,
    durationMax: null,
    types: [],
    currencies: [],
    costs: [],
    costMin: null,
    costMax: null,
    statuses: [],
    more: [],
  };
}

export function defaultSortForTab(tab: LobbyTab): LobbySort {
  return tab === 'ended' ? 'ended_recently' : 'ending_soonest';
}

export function defaultLobbyFilterStore(): LobbyFilterStore {
  return {
    official: { filters: defaultFiltersForTab('official'), sort: defaultSortForTab('official') },
    active: { filters: defaultFiltersForTab('active'), sort: defaultSortForTab('active') },
    hosting: { filters: defaultFiltersForTab('hosting'), sort: defaultSortForTab('hosting') },
    ended: { filters: defaultFiltersForTab('ended'), sort: defaultSortForTab('ended') },
  };
}

export function sortsForTab(tab: LobbyTab): { value: LobbySort; label: string }[] {
  if (tab === 'ended') {
    return [
      { value: 'ended_recently', label: 'Ended recently' },
      { value: 'prize_desc', label: 'Prize' },
      { value: 'title', label: 'Title' },
    ];
  }
  return [
    { value: 'ending_soonest', label: 'Ending soonest' },
    { value: 'starting_soonest', label: 'Starting soonest' },
    { value: 'newest', label: 'Newest' },
    { value: 'prize_desc', label: 'Prize' },
    { value: 'title', label: 'Title' },
  ];
}

export function statusOptionsForTab(tab: LobbyTab): { value: string; label: string }[] {
  if (tab === 'official') {
    return [
      { value: 'filling', label: 'Filling' },
      { value: 'arming', label: 'Arming' },
      { value: 'live', label: 'Live' },
    ];
  }
  if (tab === 'active') {
    return [
      { value: 'upcoming', label: 'Upcoming' },
      { value: 'live', label: 'Live' },
      { value: 'not_checked_in', label: 'Not checked in today' },
    ];
  }
  if (tab === 'hosting') {
    return [
      { value: 'upcoming', label: 'Upcoming' },
      { value: 'filling', label: 'Filling' },
      { value: 'live', label: 'Live' },
    ];
  }
  return [
    { value: 'ended', label: 'Ended' },
    { value: 'settling', label: 'Settling' },
    { value: 'settled', label: 'Settled' },
  ];
}

function isLobbySort(value: unknown): value is LobbySort {
  return (
    value === 'ending_soonest' ||
    value === 'starting_soonest' ||
    value === 'newest' ||
    value === 'prize_desc' ||
    value === 'title' ||
    value === 'ended_recently'
  );
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNullableNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function sanitizeFilters(tab: LobbyTab, raw: unknown): LobbyFilterState {
  const fallback = defaultFiltersForTab(tab);
  if (!raw || typeof raw !== 'object') {
    return fallback;
  }
  const row = raw as Partial<LobbyFilterState>;
  const when: LobbyWhen =
    row.when === 'day' ||
    row.when === 'week' ||
    row.when === '30d' ||
    row.when === 'year' ||
    row.when === 'all' ||
    row.when === 'custom'
      ? row.when
      : fallback.when;
  const start: LobbyStart | null =
    row.start === 'started' ||
    row.start === 'tomorrow' ||
    row.start === 'next7' ||
    row.start === 'next30' ||
    row.start === 'custom'
      ? row.start
      : null;
  return {
    when,
    customFrom: asNullableString(row.customFrom),
    customTo: asNullableString(row.customTo),
    start,
    startFrom: asNullableString(row.startFrom),
    startTo: asNullableString(row.startTo),
    durations: asStringArray(row.durations).filter(
      (item): item is LobbyDuration =>
        item === '1-7' || item === '8-30' || item === '31+' || item === 'custom',
    ),
    durationMin: asNullableNumber(row.durationMin),
    durationMax: asNullableNumber(row.durationMax),
    types: asStringArray(row.types).filter(
      (item): item is LobbyTypeFilter =>
        item === 'consistency' || item === 'points' || item === 'official_weekly',
    ),
    currencies: asStringArray(row.currencies).filter(
      (item): item is LobbyCurrencyFilter =>
        item === 'coins' || item === 'bucks' || item === 'free',
    ),
    costs: asStringArray(row.costs).filter(
      (item): item is LobbyCostFilter =>
        item === 'free' || item === 'host_funded' || item === 'buy_in',
    ),
    costMin: asNullableNumber(row.costMin),
    costMax: asNullableNumber(row.costMax),
    statuses: asStringArray(row.statuses),
    more: asStringArray(row.more).filter(
      (item): item is LobbyMoreFilter => item === 'friends' || item === 'spots_left',
    ),
  };
}

export async function loadLobbyFilterStore(): Promise<LobbyFilterStore> {
  const base = defaultLobbyFilterStore();
  const raw = await authStorage.getItem(LOBBY_FILTERS_KEY);
  if (!raw) {
    return base;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<Record<LobbyTab, Partial<LobbyTabPrefs>>>;
    for (const tab of LOBBY_TAB_VALUES) {
      const row = parsed[tab];
      if (!row) {
        continue;
      }
      base[tab] = {
        filters: sanitizeFilters(tab, row.filters),
        sort: isLobbySort(row.sort) ? row.sort : defaultSortForTab(tab),
      };
    }
    return base;
  } catch {
    return base;
  }
}

export async function saveLobbyFilterStore(store: LobbyFilterStore): Promise<void> {
  await authStorage.setItem(LOBBY_FILTERS_KEY, JSON.stringify(store));
}

export function isDefaultLobbyFilters(tab: LobbyTab, filters: LobbyFilterState): boolean {
  return JSON.stringify(filters) === JSON.stringify(defaultFiltersForTab(tab));
}

function parseDayStart(value?: string | null): number | null {
  if (!value) {
    return null;
  }
  const iso = value.includes('T') ? value : `${value}T00:00:00`;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? time : null;
}

function parseDayEnd(value?: string | null): number | null {
  if (!value) {
    return null;
  }
  const iso = value.includes('T') ? value : `${value}T23:59:59.999`;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? time : null;
}

function whenWindow(
  filters: LobbyFilterState,
  nowMs: number,
): { from: number; to: number } | null {
  if (filters.when === 'all') {
    return null;
  }
  if (filters.when === 'custom') {
    return {
      from: parseDayStart(filters.customFrom) ?? Number.NEGATIVE_INFINITY,
      to: parseDayEnd(filters.customTo) ?? Number.POSITIVE_INFINITY,
    };
  }
  const span =
    filters.when === 'day'
      ? DAY_MS
      : filters.when === 'week'
        ? 7 * DAY_MS
        : filters.when === '30d'
          ? 30 * DAY_MS
          : 365 * DAY_MS;
  return { from: nowMs - span, to: nowMs };
}

function startInstant(row: LobbyFilterable): number | null {
  const time = row.starts_at ? Date.parse(row.starts_at) : Number.NaN;
  return Number.isFinite(time) ? time : null;
}

function endedInstant(row: LobbyFilterable): number | null {
  const time = row.ends_at
    ? Date.parse(row.ends_at)
    : row.distributed_at
      ? Date.parse(row.distributed_at)
      : Number.NaN;
  return Number.isFinite(time) ? time : null;
}

function createdInstant(row: LobbyFilterable): number | null {
  const time = row.created_at ? Date.parse(row.created_at) : Number.NaN;
  return Number.isFinite(time) ? time : null;
}

export function challengeDurationDays(row: LobbyFilterable): number {
  const required = Number(row.days_required);
  if (Number.isFinite(required) && required > 0) {
    return required;
  }
  const length = Number(row.length_value);
  if (!Number.isFinite(length) || length <= 0) {
    return 0;
  }
  const unit = String(row.length_unit ?? 'days').toLowerCase();
  if (unit.startsWith('week')) {
    return length * 7;
  }
  if (unit.startsWith('month')) {
    return length * 30;
  }
  return length;
}

function matchesDuration(row: LobbyFilterable, filters: LobbyFilterState): boolean {
  const days = challengeDurationDays(row);
  const checks: boolean[] = [];
  if (filters.durations.includes('1-7')) {
    checks.push(days >= 1 && days <= 7);
  }
  if (filters.durations.includes('8-30')) {
    checks.push(days >= 8 && days <= 30);
  }
  if (filters.durations.includes('31+')) {
    checks.push(days >= 31);
  }
  if (filters.durations.includes('custom') || filters.durationMin != null || filters.durationMax != null) {
    const min = filters.durationMin ?? 0;
    const max = filters.durationMax ?? Number.POSITIVE_INFINITY;
    checks.push(days >= min && days <= max);
  }
  return checks.length === 0 || checks.some(Boolean);
}

function isPointsRow(row: LobbyFilterable): boolean {
  return (
    String(row.challenge_type ?? '').toLowerCase() === 'points' || usesComparablePointsScoring(row)
  );
}

function matchesType(row: LobbyFilterable, types: LobbyTypeFilter[]): boolean {
  if (types.length === 0) {
    return true;
  }
  return types.some((type) => {
    if (type === 'official_weekly') {
      return isOfficialSeriesChallenge(row);
    }
    if (type === 'points') {
      return isPointsRow(row);
    }
    return !isOfficialSeriesChallenge(row) && !isPointsRow(row);
  });
}

function buyInAmount(row: LobbyFilterable): number {
  return Math.max(Number(row.buy_in_amount) || 0, 0);
}

function isHostFunded(row: LobbyFilterable): boolean {
  if (row.host_funded) {
    return true;
  }
  if (Math.max(Number(row.creator_contribution) || 0, 0) > 0) {
    return true;
  }
  if (Math.max(Number(row.host_budget) || 0, 0) > 0) {
    return true;
  }
  const model = String(row.funding_model ?? '').toLowerCase();
  return model === 'host' || model === 'host_funded' || model === 'sponsored';
}

function matchesCurrency(row: LobbyFilterable, currencies: LobbyCurrencyFilter[]): boolean {
  if (currencies.length === 0) {
    return true;
  }
  return currencies.some((item) => {
    if (item === 'free') {
      return buyInAmount(row) <= 0;
    }
    return challengeCurrency(row) === item;
  });
}

function matchesCost(row: LobbyFilterable, filters: LobbyFilterState): boolean {
  const amount = buyInAmount(row);
  const inRange =
    (filters.costMin == null || amount >= filters.costMin) &&
    (filters.costMax == null || amount <= filters.costMax);
  if (filters.costs.length === 0) {
    return inRange;
  }
  const hit = filters.costs.some((item) => {
    if (item === 'free') {
      return amount <= 0;
    }
    if (item === 'host_funded') {
      return isHostFunded(row);
    }
    return amount > 0;
  });
  return hit && inRange;
}

function liveStatusKey(status: string | null | undefined): string {
  const value = String(status ?? '');
  if (value === 'in_progress') {
    return 'live';
  }
  if (value === 'open' || value === 'starting') {
    return 'upcoming';
  }
  return value;
}

function matchesStatus(
  row: LobbyFilterable,
  tab: LobbyTab,
  filters: LobbyFilterState,
  ctx: LobbyFilterContext,
): boolean {
  if (filters.statuses.length === 0) {
    return true;
  }
  const key = liveStatusKey(row.status);
  const statusHit = filters.statuses.some((item) => item !== 'not_checked_in' && item === key);
  const wantsUnchecked = filters.statuses.includes('not_checked_in');
  const uncheckedHit = wantsUnchecked && tab === 'active' && !ctx.checkedToday?.has(row.id);
  return statusHit || uncheckedHit;
}

function hasSpotsLeft(row: LobbyFilterable): boolean {
  if (row.is_unlimited || row.max_participants == null) {
    return true;
  }
  const max = Number(row.max_participants);
  if (!Number.isFinite(max) || max <= 0) {
    return true;
  }
  return Math.max(Number(row.participant_count) || 0, 0) < max;
}

function matchesMore(row: LobbyFilterable, more: LobbyMoreFilter[], ctx: LobbyFilterContext): boolean {
  if (more.length === 0) {
    return true;
  }
  return more.some((item) => {
    if (item === 'friends') {
      return (ctx.friendCounts?.get(row.id) ?? 0) > 0;
    }
    return hasSpotsLeft(row);
  });
}

function matchesWhen(row: LobbyFilterable, tab: LobbyTab, filters: LobbyFilterState, nowMs: number): boolean {
  const window = whenWindow(filters, nowMs);
  if (!window) {
    return true;
  }
  const at = tab === 'ended' ? endedInstant(row) : startInstant(row) ?? createdInstant(row);
  if (at == null) {
    return filters.when === 'all';
  }
  return at >= window.from && at <= window.to;
}

function matchesStart(row: LobbyFilterable, tab: LobbyTab, filters: LobbyFilterState, nowMs: number): boolean {
  if (tab === 'ended' || !filters.start) {
    return true;
  }
  const start = startInstant(row);
  if (filters.start === 'started') {
    return start != null && start <= nowMs;
  }
  if (filters.start === 'tomorrow') {
    if (start == null) {
      return false;
    }
    const tomorrow = new Date(nowMs);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return isSameDay(new Date(start), tomorrow);
  }
  if (filters.start === 'next7' || filters.start === 'next30') {
    if (start == null || start <= nowMs) {
      return false;
    }
    const span = filters.start === 'next7' ? 7 * DAY_MS : 30 * DAY_MS;
    return start <= nowMs + span;
  }
  const from = parseDayStart(filters.startFrom) ?? Number.NEGATIVE_INFINITY;
  const to = parseDayEnd(filters.startTo) ?? Number.POSITIVE_INFINITY;
  return start != null && start >= from && start <= to;
}

export function applyLobbyFilters<T extends LobbyFilterable>(
  rows: T[],
  tab: LobbyTab,
  filters: LobbyFilterState,
  ctx: LobbyFilterContext,
): T[] {
  return rows.filter(
    (row) =>
      matchesWhen(row, tab, filters, ctx.nowMs) &&
      matchesStart(row, tab, filters, ctx.nowMs) &&
      matchesDuration(row, filters) &&
      matchesType(row, filters.types) &&
      matchesCurrency(row, filters.currencies) &&
      matchesCost(row, filters) &&
      matchesStatus(row, tab, filters, ctx) &&
      matchesMore(row, filters.more, ctx),
  );
}

function prizeAmount(row: LobbyFilterable): number {
  return Math.max(Number(row.prize_pool) || Number(row.host_budget) || 0, 0);
}

export function sortLobbyRows<T extends LobbyFilterable>(rows: T[], sort: LobbySort): T[] {
  if (sort === 'ending_soonest') {
    return sortEndingSoonest(rows);
  }
  return [...rows].sort((a, b) => {
    if (sort === 'starting_soonest') {
      const aTime = startInstant(a) ?? Number.POSITIVE_INFINITY;
      const bTime = startInstant(b) ?? Number.POSITIVE_INFINITY;
      return aTime - bTime;
    }
    if (sort === 'newest') {
      return (createdInstant(b) ?? 0) - (createdInstant(a) ?? 0);
    }
    if (sort === 'prize_desc') {
      return prizeAmount(b) - prizeAmount(a);
    }
    if (sort === 'ended_recently') {
      return (endedInstant(b) ?? 0) - (endedInstant(a) ?? 0);
    }
    return String(a.title ?? '').localeCompare(String(b.title ?? ''), undefined, {
      sensitivity: 'base',
    });
  });
}

export function lobbyFilterChips(tab: LobbyTab, filters: LobbyFilterState): LobbyFilterChip[] {
  const defaults = defaultFiltersForTab(tab);
  const chips: LobbyFilterChip[] = [];
  if (filters.when !== defaults.when) {
    const whenLabel: Record<LobbyWhen, string> = {
      day: 'Past day',
      week: 'Past week',
      '30d': 'Past 30 days',
      year: 'Past year',
      all: 'All-time',
      custom: 'Custom dates',
    };
    chips.push({ id: 'when', label: whenLabel[filters.when] });
  }
  if (tab !== 'ended' && filters.start) {
    const startLabel: Record<LobbyStart, string> = {
      started: 'Started',
      tomorrow: 'Tomorrow',
      next7: 'Next 7 days',
      next30: 'Next 30 days',
      custom: 'Custom start',
    };
    chips.push({ id: 'start', label: startLabel[filters.start] });
  }
  for (const duration of filters.durations) {
    const label =
      duration === '1-7'
        ? '1–7 days'
        : duration === '8-30'
          ? '8–30 days'
          : duration === '31+'
            ? '31+ days'
            : 'Custom duration';
    chips.push({ id: `duration:${duration}`, label });
  }
  for (const type of filters.types) {
    chips.push({
      id: `type:${type}`,
      label: type === 'official_weekly' ? 'Official weekly' : type === 'points' ? 'Points' : 'Consistency',
    });
  }
  for (const currency of filters.currencies) {
    chips.push({
      id: `currency:${currency}`,
      label: currency === 'coins' ? 'Coins' : currency === 'bucks' ? 'Bucks' : 'Free',
    });
  }
  for (const cost of filters.costs) {
    chips.push({
      id: `cost:${cost}`,
      label: cost === 'host_funded' ? 'Host-funded' : cost === 'buy_in' ? 'Buy-in' : 'Free',
    });
  }
  if (filters.costMin != null || filters.costMax != null) {
    chips.push({
      id: 'cost-range',
      label:
        filters.costMin != null && filters.costMax != null
          ? `${filters.costMin}–${filters.costMax}`
          : filters.costMin != null
            ? `Min ${filters.costMin}`
            : `Max ${filters.costMax}`,
    });
  }
  const statusLabels = new Map(statusOptionsForTab(tab).map((item) => [item.value, item.label]));
  for (const status of filters.statuses) {
    chips.push({ id: `status:${status}`, label: statusLabels.get(status) ?? status });
  }
  for (const more of filters.more) {
    chips.push({
      id: `more:${more}`,
      label: more === 'friends' ? 'Friends in it' : 'Spots left',
    });
  }
  return chips;
}

export function lobbyFilterBadgeCount(tab: LobbyTab, filters: LobbyFilterState): number {
  return lobbyFilterChips(tab, filters).length;
}

export function clearLobbyFilterChip(
  filters: LobbyFilterState,
  chipId: string,
): LobbyFilterState {
  const next = { ...filters };
  if (chipId === 'when') {
    next.when = 'all';
    next.customFrom = null;
    next.customTo = null;
    return next;
  }
  if (chipId === 'start') {
    next.start = null;
    next.startFrom = null;
    next.startTo = null;
    return next;
  }
  if (chipId === 'cost-range') {
    next.costMin = null;
    next.costMax = null;
    return next;
  }
  const [group, value] = chipId.split(':');
  if (group === 'duration') {
    next.durations = next.durations.filter((item) => item !== value);
    if (value === 'custom') {
      next.durationMin = null;
      next.durationMax = null;
    }
    return next;
  }
  if (group === 'type') {
    next.types = next.types.filter((item) => item !== value);
    return next;
  }
  if (group === 'currency') {
    next.currencies = next.currencies.filter((item) => item !== value);
    return next;
  }
  if (group === 'cost') {
    next.costs = next.costs.filter((item) => item !== value);
    return next;
  }
  if (group === 'status') {
    next.statuses = next.statuses.filter((item) => item !== value);
    return next;
  }
  if (group === 'more') {
    next.more = next.more.filter((item) => item !== value);
  }
  return next;
}

export function lobbyResultLine(input: {
  result?: string | null;
  place?: number | null;
}): string | null {
  const result = String(input.result ?? '').toLowerCase();
  const place = Number(input.place);
  const placed = Number.isFinite(place) && place > 0 ? `You placed ${place}` : null;
  if (result === 'won') {
    return placed ? `${placed} · won` : 'You won';
  }
  if (result === 'split') {
    return placed ? `${placed} · split` : 'You split the prize';
  }
  if (result === 'lost') {
    return 'You didn’t place';
  }
  if (result === 'forfeited') {
    return 'Prize forfeited';
  }
  if (result === 'dropped') {
    return 'You dropped';
  }
  if (result === 'remaining') {
    return placed ?? 'You finished';
  }
  return placed;
}

export function endedDatetimeLine(endsAt?: string | null, distributedAt?: string | null): string | null {
  const at = parseInstant(endsAt) ?? parseInstant(distributedAt);
  if (!at) {
    return 'Ended';
  }
  return `Ended ${format(at, 'MMM d')} · ${format(at, 'h:mm a')}`;
}
