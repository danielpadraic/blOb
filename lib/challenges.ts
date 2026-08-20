import { getPaymentsProvider } from '@/services/payments';
import { publishChallenge } from '@/lib/api/challenges';
import {
  DISCOVER_CHALLENGE_STATUSES,
  LOBBY_CHALLENGE_STATUSES,
  LOBBY_PAGE_SIZE,
  PROOF_TYPES,
} from '@/lib/constants';
import {
  namedProofsFromLegacyTypes,
  resolveChallengeProofs,
  type ChallengeProof,
} from '@/lib/challengeProofs';
import { supabase } from '@/lib/supabase';
import type {
  Challenge,
  ChallengeFrequency,
  ChallengeParticipant,
  ChallengeStatus,
  ChallengeTask,
  ChallengeWithStats,
  FundingModel,
  PrizeStructure,
  ProofRequirement,
  ProofType,
  TopPlacesDistribution,
  TopPlacesMode,
} from '@/lib/types';
import { getCreateChallengeMessage, getErrorMessage, isMissingRelationError, logPostgrestError } from '@/utils/errors';
import { challengeCurrency, formatWallet } from '@/lib/currency';
import { applyLaneForPublish, isInviteOnlyChallenge } from '@/lib/challengeLane';
import {
  isInviteOnlyDiscoverable,
  isJoinableNotStarted,
  isLiveOrUpcoming,
} from '@/lib/challengeDiscoverability';

import { formatCoins } from '@/utils/format';
import { copy } from '@/lib/copy';
import { parseOfficialDayWindows } from '@/lib/officialDays';
import { OFFICIAL_WEEK_10_SLUG, pickFeaturedOfficialChallenge } from '@/lib/officialSeries';

const JOINABLE_NOT_STARTED_STATUSES = ['open', 'upcoming', 'starting'] as const;

const DEFAULT_PROOFS: ProofRequirement[] = [
  { type: 'pre_selfie', required: true },
  { type: 'post_selfie', required: true },
  { type: 'hr_monitor', required: true },
];

const LOBBY_SELECTS = [
  '*',
  'id, title, description, rules, is_official, created_by, buy_in_amount, days_required, min_minutes, proof_requirements, status, starts_at, ends_at, prize_pool, prize_structure, top_places_mode, top_places_value, top_places_distribution, funding_model, creator_contribution, max_participants, is_unlimited, category, challenge_type, visibility, frequency, target_count, tasks, created_at, updated_at',
  'id, title, description, rules, is_official, created_by, buy_in_amount, days_required, min_minutes, proof_requirements, status, starts_at, ends_at, prize_pool, prize_structure, top_places_mode, top_places_value, top_places_distribution, category, challenge_type, visibility, frequency, target_count, tasks, created_at, updated_at',
  'id, title, description, rules, is_official, created_by, buy_in_amount, days_required, min_minutes, proof_requirements, status, starts_at, ends_at, prize_pool, category, challenge_type, visibility, frequency, target_count, tasks, created_at, updated_at',
  'id, title, description, rules, is_official, created_by, buy_in_amount, days_required, min_minutes, proof_requirements, status, starts_at, ends_at, prize_pool, category, challenge_type, visibility, created_at, updated_at',
  'id, title, description, rules, is_official, created_by, buy_in_amount, days_required, min_minutes, status, starts_at, ends_at, prize_pool, category, challenge_type, visibility',
  'id, title, is_official, created_by, buy_in_amount, days_required, status, category, challenge_type, visibility, prize_pool',
  'id, title, is_official, buy_in_amount, status',
] as const;

export type CreateChallengeInput = {
  title: string;
  description: string | null;
  rules: string | null;
  created_by: string;
  buy_in_amount: number;
  days_required: number;
  min_minutes: number;
  proof_requirements: ProofRequirement[];
  target_count: number;
  frequency: string;
  tasks: ChallengeTask[];
  starts_at: string;
  ends_at: string | null;
  end_mode?: string | null;
  length_value?: number | null;
  length_unit?: string | null;
  category: string;
  challenge_type: string;
  visibility: string;
  prize_structure: string;
  top_places_mode: string | null;
  top_places_value: number | null;
  top_places_distribution: string | null;
  funding_model: string;
  creator_contribution: number;
  max_participants: number | null;
  is_unlimited: boolean;
  prize_pool: number;
  currency: string;
  challenge_lane?: string;
  creator_participating?: boolean;
  cover_image_url?: string | null;
  rules_video_url?: string | null;
  rules_list?: unknown;
  draft_id?: string | null;
  min_participants?: number;
  host_funded?: boolean;
  host_budget?: number;
  format?: string;
  task?: string | null;
  required_checkins?: number | null;
  misses_allowed?: number;
  proof_type?: string | null;
  proofs?: unknown;
  proof_review?: string;
  payout_mode?: string;
  timezone?: string | null;
  start_rule?: string;
  discoverability?: string | null;
};

type ChallengeRow = Record<string, unknown>;
type QueryResult<T> = { data: T | null; error: { message: string } | null };

type ChallengeListQuery = {
  select: (columns: string) => ChallengeListQuery;
  in: (column: string, values: readonly string[]) => ChallengeListQuery;
  eq: (column: string, value: string) => ChallengeListQuery;
  or: (filters: string) => ChallengeListQuery;
  order: (column: string, options?: { ascending?: boolean }) => ChallengeListQuery;
  limit: (count: number) => ChallengeListQuery;
  maybeSingle: () => Promise<QueryResult<ChallengeRow>>;
  then: Promise<QueryResult<ChallengeRow[]>>['then'];
};

function challengeList(): ChallengeListQuery {
  return supabase.from('challenges') as unknown as ChallengeListQuery;
}

function asChallengeRows(data: ChallengeRow[] | ChallengeRow | null | undefined): ChallengeRow[] {
  if (Array.isArray(data)) {
    return data;
  }
  if (data && typeof data === 'object') {
    return [data];
  }
  return [];
}

async function selectChallengeList(
  build: (query: ChallengeListQuery) => ChallengeListQuery,
  label: string,
): Promise<ChallengeRow[]> {
  let lastError: string | null = null;
  for (const columns of LOBBY_SELECTS) {
    const { data, error } = await build(challengeList().select(columns));
    if (error) {
      lastError = error.message;
      console.log('[blob:lobby] select failed', { label, columns, message: error.message });
      continue;
    }
    return asChallengeRows(data);
  }
  throw new Error(getErrorMessage(lastError));
}

function isLobbyStatus(status: string | null | undefined): boolean {
  return (LOBBY_CHALLENGE_STATUSES as readonly string[]).includes(status ?? '');
}

function isDiscoverStatus(status: string | null | undefined): boolean {
  return (DISCOVER_CHALLENGE_STATUSES as readonly string[]).includes(status ?? '');
}

function isListedVisibility(visibility: string | null | undefined): boolean {
  const value = String(visibility ?? 'public').toLowerCase();
  return value === 'public' || value === 'unlisted' || value === 'friends' || value === '';
}

export function isLiveCompetitorStatus(status: string | null | undefined): boolean {
  const value = String(status ?? 'joined');
  return value === 'joined' || value === 'active' || value === 'completed';
}

export function countLiveCompetitors(
  rows: { status?: string | null }[] | null | undefined,
): number {
  return (rows ?? []).filter((row) => isLiveCompetitorStatus(row.status)).length;
}

export function competitorSpotsLabel(
  count: number,
  maxParticipants: number | null | undefined,
): string {
  const n = Math.max(Number(count) || 0, 0);
  const max = Number(maxParticipants);
  if (!Number.isFinite(max) || max <= 0) {
    return String(n);
  }
  return `${n}/${max}`;
}

async function fetchJoinedChallengeIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('challenge_participants')
    .select('challenge_id, status')
    .eq('user_id', userId);
  if (error) {
    console.log('[blob:lobby] participants failed', error.message);
    throw new Error(getErrorMessage(error));
  }
  return (data ?? [])
    .filter((row) => isLiveCompetitorStatus((row as { status?: string }).status))
    .map((row) => (row as { challenge_id: string }).challenge_id)
    .filter(Boolean);
}

function isOpenInviteStatus(status: string | null | undefined): boolean {
  const value = String(status ?? 'pending');
  return value === 'pending' || value === 'accepted';
}

/** Soft-fail: missing table (PGRST205), 404, or any invite error → []. Never throws. */
async function fetchInvitedChallengeIds(userId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('challenge_invites')
      .select('challenge_id, status')
      .eq('invitee_id', userId);
    if (error) {
      console.log('[blob:lobby] invites skipped', error.code ?? '', error.message);
      return [];
    }
    return (data ?? [])
      .filter((row) => isOpenInviteStatus((row as { status?: string }).status))
      .map((row) => (row as { challenge_id?: string }).challenge_id)
      .filter((id): id is string => Boolean(id));
  } catch (error) {
    if (isMissingRelationError(error)) {
      console.log('[blob:lobby] invites skipped', getErrorMessage(error));
    } else {
      console.log('[blob:lobby] invites skipped', error);
    }
    return [];
  }
}

function mergeChallenges(...groups: Challenge[][]): Challenge[] {
  const byId = new Map<string, Challenge>();
  for (const group of groups) {
    for (const row of group) {
      byId.set(row.id, row);
    }
  }
  return [...byId.values()];
}

export function isPointsChallenge(
  challenge: { challenge_type?: string | null } | null | undefined,
): boolean {
  return challenge?.challenge_type === 'points';
}

export function challengeTargetCount(
  challenge: Pick<Challenge, 'target_count' | 'days_required'> | null | undefined,
): number {
  if (!challenge) {
    return 1;
  }
  return Math.max(Number(challenge.target_count || challenge.days_required || 1), 1);
}

export function totalTaskPoints(tasks: ChallengeTask[] | null | undefined): number {
  return (tasks ?? []).reduce((sum, task) => sum + Math.max(Number(task.points) || 0, 0), 0);
}

export function frequencyNoun(frequency: string | null | undefined): string {
  if (frequency === 'weekly') return 'weekly';
  if (frequency === 'monthly') return 'monthly';
  if (frequency === 'once') return 'one-time';
  return 'daily';
}

export function normalizeFrequency(value: unknown): ChallengeFrequency {
  if (
    value === 'weekly' ||
    value === 'monthly' ||
    value === 'once' ||
    value === 'daily' ||
    value === '3x_week' ||
    value === 'custom'
  ) {
    return value;
  }
  return 'daily';
}

export function normalizeTasks(value: unknown): ChallengeTask[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((raw, index) => {
    const row = (raw ?? {}) as Record<string, unknown>;
    const proofTypes = Array.isArray(row.proof_types)
      ? row.proof_types.map((item) => String(item)).filter(Boolean)
      : undefined;
    return {
      id: String(row.id ?? `task-${index + 1}`),
      title: String(row.title ?? '').trim() || `Task ${index + 1}`,
      points: Number(row.points ?? 0),
      proof_required: Boolean(row.proof_required),
      proof_types: proofTypes,
      once: Boolean(row.once),
    };
  });
}

export function normalizePrizeStructure(value: unknown): PrizeStructure {
  if (value === 'winner_take_all' || value === 'top_places') {
    return value;
  }
  return 'equal_split';
}

export function normalizeTopPlacesMode(value: unknown): TopPlacesMode | null {
  if (value === 'percent' || value === 'count') {
    return value;
  }
  return null;
}

export function normalizeTopPlacesDistribution(value: unknown): TopPlacesDistribution | null {
  if (value === 'even' || value === 'scaled') {
    return value;
  }
  return null;
}

export type PrizeStructureConfig = {
  prize_structure?: string | null;
  top_places_mode?: string | null;
  top_places_value?: number | string | null;
  top_places_distribution?: string | null;
  is_unlimited?: boolean | null;
};

export function prizeDistributionLabel(config: PrizeStructureConfig): string {
  if (config.is_unlimited) {
    return 'Last standing';
  }
  const structure = normalizePrizeStructure(config.prize_structure);
  if (structure === 'winner_take_all') {
    return 'Winner take all';
  }
  if (structure === 'top_places') {
    return config.top_places_distribution === 'scaled' ? 'Top places scaled' : 'Top places';
  }
  return 'Prize split evenly';
}

export function prizeStructureSummary(config: PrizeStructureConfig): string {
  if (config.is_unlimited) {
    return 'The last person still meeting the requirement wins the entire prize.';
  }
  const structure = normalizePrizeStructure(config.prize_structure);
  if (structure === 'winner_take_all') {
    return 'One winner takes the entire prize.';
  }
  if (structure !== 'top_places') {
    return 'Everyone who successfully completes the challenge splits the prize evenly.';
  }

  const raw = Number(config.top_places_value);
  const value = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
  const mode = config.top_places_mode === 'count' ? 'count' : 'percent';
  const scaled = config.top_places_distribution === 'scaled';
  const who =
    mode === 'count'
      ? `The top ${value || '—'} finisher${value === 1 ? '' : 's'}`
      : `Top ${value || '—'}% of finishers`;

  if (scaled) {
    return `${who} share the prize on a sliding scale — 1st place earns the most, then 2nd, and so on.`;
  }
  return `${who} will split the prize evenly.`;
}

export function normalizeFundingModel(value: unknown): FundingModel {
  if (value === 'creator' || value === 'hybrid') {
    return value;
  }
  return 'participants';
}

export function fundingModelSummary(config: {
  funding_model?: string | null;
  creator_contribution?: number | string | null;
  buy_in_amount?: number | string | null;
  currency?: string | null;
}): string {
  const model = normalizeFundingModel(config.funding_model);
  const contribution = Math.max(Number(config.creator_contribution) || 0, 0);
  const buyIn = Math.max(Number(config.buy_in_amount) || 0, 0);
  const money = (amount: number) => formatWallet(amount, config.currency);

  if (model === 'creator') {
    return buyIn > 0
      ? `The creator funds the prize with ${money(contribution)}. Competitors also pay ${money(buyIn)} to enter.`
      : `The creator funds the entire prize with ${money(contribution)}. Competitors enter free.`;
  }
  if (model === 'hybrid') {
    return `The creator puts in ${money(contribution)} and each competitor pays ${money(buyIn)}. Both go into the prize.`;
  }
  return `The prize is funded only by competitor entry fees of ${money(buyIn)} each.`;
}

export function isUnlimitedChallenge(
  challenge: { is_unlimited?: boolean | null; ends_at?: string | null } | null | undefined,
): boolean {
  return Boolean(challenge?.is_unlimited);
}

export function lastManStandingRequirement(challenge: {
  frequency?: string | null;
  target_count?: number | null;
  days_required?: number | null;
}): string {
  const target = Math.max(Number(challenge.target_count || challenge.days_required) || 1, 1);
  if (challenge.frequency === 'weekly') {
    return `Stay active ${target} day${target === 1 ? '' : 's'} every week to remain eligible. Miss the weekly requirement and you’re out.`;
  }
  if (challenge.frequency === 'monthly') {
    return `Stay active ${target} day${target === 1 ? '' : 's'} every month to remain eligible. Miss a month and you’re out.`;
  }
  return 'Check in every day to stay in. Miss a day and you’re out.';
}

export function isChallengeFull(challenge: {
  max_participants?: number | null;
  participant_count?: number | null;
}): boolean {
  if (challenge.max_participants == null) {
    return false;
  }
  return Number(challenge.participant_count ?? 0) >= Number(challenge.max_participants);
}

function normalizeRulesPayload(list: unknown, structured: unknown): unknown {
  if (list && typeof list === 'object' && !Array.isArray(list)) {
    return list;
  }
  if (Array.isArray(list) && list.length > 0) {
    return list;
  }
  if (structured && typeof structured === 'object') {
    return structured;
  }
  return list ?? structured ?? [];
}

function asOptionalUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function participantLimitSummary(challenge: {
  max_participants?: number | null;
  participant_count?: number | null;
}): string {
  const joined = Number(challenge.participant_count ?? 0);
  if (challenge.max_participants == null) {
    return joined === 1 ? '1 competitor · Unlimited competitors' : `${joined} competitors · Unlimited competitors`;
  }
  return `${joined} of ${challenge.max_participants} competitors`;
}

export function normalizeChallenge(row: ChallengeRow): Challenge {
  const now = new Date().toISOString();
  const status = String(row.status ?? 'open').trim().toLowerCase() as ChallengeStatus;
  const daysRequired = Number(row.days_required ?? row.target_count ?? 6);
  const rawType = String(row.challenge_type ?? 'consistency');
  return {
    id: String(row.id),
    title: String(row.title ?? 'Untitled challenge'),
    description: (row.description as string | null) ?? null,
    rules: (row.rules as string | null) ?? null,
    is_official: Boolean(row.is_official),
    created_by: (row.created_by as string | null) ?? null,
    buy_in_amount: Number(row.buy_in_amount ?? 10),
    days_required: daysRequired,
    min_minutes: Number(row.min_minutes ?? 30),
    proof_requirements: Array.isArray(row.proof_requirements)
      ? (row.proof_requirements as ProofRequirement[])
      : DEFAULT_PROOFS,
    proofs: resolveChallengeProofs({
      proofs: row.proofs,
      proof_type: row.proof_type,
      proof_requirements: Array.isArray(row.proof_requirements)
        ? (row.proof_requirements as ProofRequirement[])
        : null,
    }),
    target_count: Number(row.target_count ?? daysRequired),
    frequency: normalizeFrequency(row.frequency),
    tasks: normalizeTasks(row.tasks),
    status,
    starts_at:
      row.starts_at != null
        ? String(row.starts_at)
        : status === 'filling' || status === 'arming'
          ? ''
          : String(row.created_at ?? now),
    ends_at: Boolean(row.is_unlimited)
      ? null
      : row.ends_at
        ? String(row.ends_at)
        : null,
    prize_pool: Number(row.prize_pool ?? 0),
    prize_structure: normalizePrizeStructure(row.prize_structure),
    top_places_mode: normalizeTopPlacesMode(row.top_places_mode),
    top_places_value:
      row.top_places_value == null ? null : Number(row.top_places_value),
    top_places_distribution: normalizeTopPlacesDistribution(row.top_places_distribution),
    scaled_first_place_pct:
      row.scaled_first_place_pct == null ? null : Number(row.scaled_first_place_pct),
    funding_model: normalizeFundingModel(row.funding_model),
    creator_contribution: Number(row.creator_contribution ?? 0),
    max_participants:
      row.max_participants == null ? null : Number(row.max_participants),
    min_participants: Math.max(Number(row.min_participants ?? 2), 2),
    start_roll_pending: Boolean(row.start_roll_pending),
    start_roll_keep_days: row.start_roll_keep_days == null ? null : Number(row.start_roll_keep_days),
    start_roll_shift_days: Number(row.start_roll_shift_days ?? 0),
    is_unlimited: Boolean(row.is_unlimited),
    start_mode: (row.start_mode as string | null) ?? null,
    start_within_value: row.start_within_value == null ? null : Number(row.start_within_value),
    start_within_unit: (row.start_within_unit as string | null) ?? null,
    full_lobby_start_time: (row.full_lobby_start_time as string | null) ?? null,
    full_lobby_day_offset: Number(row.full_lobby_day_offset ?? 0),
    end_mode: (row.end_mode as string | null) ?? null,
    length_value: row.length_value == null ? null : Number(row.length_value),
    length_unit: (row.length_unit as string | null) ?? null,
    creator_participating: row.creator_participating == null ? true : Boolean(row.creator_participating),
    cover_image_url: asOptionalUrl(row.cover_image_url),
    rules_video_url: asOptionalUrl(row.rules_video_url),
    official_started_at: row.official_started_at ? String(row.official_started_at) : null,
    judging_started_at: row.judging_started_at ? String(row.judging_started_at) : null,
    distribution_mode: (row.distribution_mode as string | null) ?? null,
    distribution_scheduled_at: row.distribution_scheduled_at
      ? String(row.distribution_scheduled_at)
      : null,
    distributed_at: row.distributed_at ? String(row.distributed_at) : null,
    rules_list: normalizeRulesPayload(row.rules_list, row.rules_structured),
    category: (row.category as string | null) ?? null,
    challenge_type: rawType === 'points' ? 'points' : 'consistency',
    visibility: (row.visibility as string | null) ?? null,
    discoverability: (row.discoverability as string | null) ?? null,
    allowed_states: Array.isArray(row.allowed_states) ? (row.allowed_states as string[]) : null,
    challenge_lane: (row.challenge_lane as string | null) ?? null,
    currency: challengeCurrency(row as { currency?: string | null }),
    host_funded: Boolean(row.host_funded),
    host_budget: Number(row.host_budget ?? row.creator_contribution ?? 0),
    format: (row.format as string | null) ?? null,
    task: (row.task as string | null) ?? null,
    required_checkins: row.required_checkins == null ? null : Number(row.required_checkins),
    misses_allowed: Number(row.misses_allowed ?? 0),
    proof_type: (row.proof_type as string | null) ?? null,
    proof_review: (row.proof_review as string | null) ?? null,
    payout_mode: (row.payout_mode as string | null) ?? null,
    timezone: (row.timezone as string | null) ?? null,
    start_rule: (row.start_rule as string | null) ?? null,
    cancelled_at: row.cancelled_at ? String(row.cancelled_at) : null,
    cancelled_by: (row.cancelled_by as string | null) ?? null,
    series_id: row.series_id ? String(row.series_id) : null,
    armed_at: row.armed_at ? String(row.armed_at) : null,
    day_windows: parseOfficialDayWindows(row.day_windows),
    created_at: String(row.created_at ?? now),
    updated_at: String(row.updated_at ?? now),
  };
}

export function sortOfficialFirst(rows: Challenge[]): Challenge[] {
  const statusRank = (status: string) => {
    if (status === 'settled') return 2;
    if (status === 'judging') return 1;
    return 0;
  };
  return [...rows].sort((a, b) => {
    if (a.is_official !== b.is_official) {
      return a.is_official ? -1 : 1;
    }
    const rank = statusRank(a.status) - statusRank(b.status);
    if (rank !== 0) {
      return rank;
    }
    return new Date(a.starts_at ?? a.created_at).getTime() - new Date(b.starts_at ?? b.created_at).getTime();
  });
}

/** Personal Lobby: soonest start, then most recently updated. */
export function sortMyLobby(rows: Challenge[]): Challenge[] {
  return [...rows].sort((a, b) => {
    const startA = new Date(a.starts_at ?? a.created_at).getTime();
    const startB = new Date(b.starts_at ?? b.created_at).getTime();
    if (startA !== startB) {
      return startA - startB;
    }
    const updatedA = new Date(a.updated_at ?? a.created_at).getTime();
    const updatedB = new Date(b.updated_at ?? b.created_at).getTime();
    return updatedB - updatedA;
  });
}

async function fetchAcceptedFriendIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select('user_a_id, user_b_id, status')
    .eq('status', 'accepted')
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`);
  if (error) {
    console.log('[blob:lobby] friends skipped', error.message);
    return [];
  }
  return [...new Set(
    (data ?? []).map((row) => (row.user_a_id === userId ? row.user_b_id : row.user_a_id)).filter(Boolean),
  )];
}

export async function fetchActiveChallenges(userId?: string): Promise<Challenge[]> {
  if (!userId) {
    return [];
  }
  const [mine, joinedIds] = await Promise.all([
    fetchJoinedLobbyChallenges(userId),
    fetchJoinedChallengeIds(userId),
  ]);
  const joined = new Set(joinedIds);
  return sortMyLobby(
    mine.filter(
      (row) =>
        isLiveOrUpcoming(row.status) &&
        (row.created_by === userId || joined.has(row.id)),
    ),
  );
}

export async function fetchHostingChallenges(userId?: string): Promise<Challenge[]> {
  if (!userId) {
    return [];
  }
  const mine = await fetchJoinedLobbyChallenges(userId);
  return sortMyLobby(
    mine.filter((row) => row.created_by === userId && isLiveOrUpcoming(row.status)),
  );
}

export async function fetchCompetingChallenges(userId?: string): Promise<Challenge[]> {
  if (!userId) {
    return [];
  }
  const joinedIds = new Set(await fetchJoinedChallengeIds(userId));
  const mine = await fetchJoinedLobbyChallenges(userId);
  return sortMyLobby(
    mine.filter(
      (row) =>
        row.created_by !== userId &&
        joinedIds.has(row.id) &&
        isLiveOrUpcoming(row.status),
    ),
  );
}

export async function fetchOfficialDiscoverChallenges(userId?: string): Promise<Challenge[]> {
  try {
    await supabase.rpc('tick_official_series');
  } catch (error) {
    console.log('[blob:lobby] official tick skipped', error);
  }

  const listed = await supabase.rpc('list_official_joinable');
  if (!listed.error && listed.data) {
    const rows = asChallengeRows(listed.data as ChallengeRow[])
      .map(normalizeChallenge)
      .filter((row) => row.is_official && row.series_id && (row.status === 'filling' || row.status === 'arming'));
    return sortOfficialFirst(rows);
  }
  console.log('[blob:lobby] official-joinable rpc skipped', listed.error?.message);

  const fallback = await selectChallengeList(
    (query) =>
      query
        .eq('is_official', true as unknown as string)
        .in('status', ['filling', 'arming'])
        .not('series_id', 'is', null)
        .order('created_at', { ascending: true })
        .limit(LOBBY_PAGE_SIZE),
    'official-discover',
  );
  const joined = new Set(userId ? await fetchJoinedChallengeIds(userId) : []);
  const rows = fallback
    .map(normalizeChallenge)
    .filter((row) => {
      if (!row.is_official || !row.series_id || joined.has(row.id)) {
        return false;
      }
      return row.status === 'filling' || row.status === 'arming';
    });
  return sortOfficialFirst(rows);
}

export async function fetchFeaturedOfficialChallenge(userId?: string): Promise<Challenge | null> {
  try {
    await supabase.rpc('tick_official_series');
  } catch (error) {
    console.log('[blob:home] official tick skipped', error);
  }

  let joinable: Challenge[] = [];
  const listed = await supabase.rpc('list_official_joinable');
  if (!listed.error && listed.data) {
    joinable = asChallengeRows(listed.data as unknown as ChallengeRow[])
      .map(normalizeChallenge)
      .filter(
        (row) =>
          row.is_official &&
          row.series_id === OFFICIAL_WEEK_10_SLUG &&
          (row.status === 'filling' || row.status === 'arming'),
      );
  } else {
    console.log('[blob:home] official-joinable rpc skipped', listed.error?.message);
    joinable = (
      await selectChallengeList(
        (query) =>
          query
            .eq('is_official', true as unknown as string)
            .eq('series_id', OFFICIAL_WEEK_10_SLUG)
            .in('status', ['filling', 'arming'])
            .order('created_at', { ascending: true })
            .limit(4),
        'featured-official-joinable',
      )
    ).map(normalizeChallenge);
  }

  let liveJoined: Challenge | null = null;
  if (userId) {
    const joinedIds = await fetchJoinedChallengeIds(userId);
    if (joinedIds.length > 0) {
      const liveRows = await selectChallengeList(
        (query) =>
          query
            .in('id', joinedIds)
            .eq('is_official', true as unknown as string)
            .eq('series_id', OFFICIAL_WEEK_10_SLUG)
            .eq('status', 'live')
            .order('starts_at', { ascending: false })
            .limit(4),
        'featured-official-live',
      );
      liveJoined = liveRows.map(normalizeChallenge)[0] ?? null;
    }
  }

  return pickFeaturedOfficialChallenge({
    liveJoined,
    filling: joinable.find((row) => row.status === 'filling') ?? null,
    arming: joinable.find((row) => row.status === 'arming') ?? null,
  });
}

export type FriendChallengeProof = {
  challenge: Challenge;
  kind: 'hosting' | 'joined';
  friendId: string;
};

export async function fetchFriendsDiscoverChallenges(userId?: string): Promise<FriendChallengeProof[]> {
  if (!userId) {
    return [];
  }
  const friendIds = await fetchAcceptedFriendIds(userId);
  if (friendIds.length === 0) {
    return [];
  }
  const [joinedIdList, invitedIdList] = await Promise.all([
    fetchJoinedChallengeIds(userId),
    fetchInvitedChallengeIds(userId),
  ]);
  const joinedIds = new Set(joinedIdList);
  const invitedIds = new Set(invitedIdList);
  const hosted = await selectChallengeList(
    (query) =>
      query
        .in('created_by', friendIds)
        .in('status', JOINABLE_NOT_STARTED_STATUSES)
        .order('starts_at', { ascending: true })
        .limit(LOBBY_PAGE_SIZE),
    'friends-hosted',
  ).catch((error) => {
    console.log('[blob:lobby] friends-hosted skipped', error);
    return [] as ChallengeRow[];
  });

  const friendParts = await supabase
    .from('challenge_participants')
    .select('challenge_id, user_id, status')
    .in('user_id', friendIds)
    .in('status', ['joined', 'active', 'completed']);
  const friendChallengeIds = [
    ...new Set((friendParts.data ?? []).map((row) => row.challenge_id).filter(Boolean)),
  ].filter((id) => !joinedIds.has(id));
  const joinedByFriends =
    friendChallengeIds.length === 0
      ? []
      : await selectChallengeList(
          (query) =>
            query
              .in('id', friendChallengeIds)
              .in('status', JOINABLE_NOT_STARTED_STATUSES)
              .order('starts_at', { ascending: true })
              .limit(LOBBY_PAGE_SIZE),
          'friends-joined',
        ).catch((error) => {
          console.log('[blob:lobby] friends-joined skipped', error);
          return [] as ChallengeRow[];
        });

  const byId = new Map<string, Challenge>();
  for (const row of [...hosted, ...joinedByFriends]) {
    const challenge = normalizeChallenge(row);
    if (
      challenge.is_official ||
      joinedIds.has(challenge.id) ||
      challenge.created_by === userId ||
      !isJoinableNotStarted(challenge.status) ||
      (isInviteOnlyDiscoverable(challenge) && !invitedIds.has(challenge.id))
    ) {
      continue;
    }
    byId.set(challenge.id, challenge);
  }

  const proof: FriendChallengeProof[] = [];
  for (const challenge of byId.values()) {
    if (challenge.created_by && friendIds.includes(challenge.created_by)) {
      proof.push({ challenge, kind: 'hosting', friendId: challenge.created_by });
      continue;
    }
    const joiner = (friendParts.data ?? []).find((row) => row.challenge_id === challenge.id);
    if (joiner?.user_id) {
      proof.push({ challenge, kind: 'joined', friendId: joiner.user_id });
    }
  }
  return proof.sort(
    (a, b) =>
      new Date(a.challenge.starts_at ?? a.challenge.created_at).getTime() -
      new Date(b.challenge.starts_at ?? b.challenge.created_at).getTime(),
  );
}

export async function fetchDiscoverChallenges(_userId?: string): Promise<Challenge[]> {
  const listedPromise = selectChallengeList(
    (query) =>
      query
        .in('status', DISCOVER_CHALLENGE_STATUSES)
        .or('is_official.eq.true,visibility.in.(public,unlisted,friends),visibility.is.null')
        .order('starts_at', { ascending: true })
        .limit(LOBBY_PAGE_SIZE),
    'discover',
  ).then((rows) =>
    rows
      .map(normalizeChallenge)
      .filter(
        (row) =>
          isDiscoverStatus(row.status) &&
          !isInviteOnlyChallenge(row) &&
          (row.is_official || isListedVisibility(row.visibility)),
      ),
  );

  const visible = await listedPromise;
  console.log('[blob:lobby] discover', {
    count: visible.length,
    titles: visible.map((row) => row.title),
  });
  return sortOfficialFirst(visible);
}

/** Personal Lobby: created_by ∪ live participant rows, deduped by id. */
export async function fetchJoinedLobbyChallenges(userId?: string): Promise<Challenge[]> {
  if (!userId) {
    return [];
  }

  const createdPromise = selectChallengeList(
    (query) =>
      query
        .eq('created_by', userId)
        .in('status', LOBBY_CHALLENGE_STATUSES)
        .order('starts_at', { ascending: true })
        .limit(LOBBY_PAGE_SIZE),
    'created-mine',
  )
    .then((rows) => rows.map(normalizeChallenge).filter((row) => isLobbyStatus(row.status)))
    .catch((error) => {
      console.log('[blob:lobby] created-mine skipped', error);
      return [] as Challenge[];
    });

  const joinedPromise = fetchJoinedChallengeIds(userId).then(async (ids) => {
    if (ids.length === 0) {
      return [] as Challenge[];
    }
    const rows = await selectChallengeList(
      (query) =>
        query
          .in('id', ids)
          .order('starts_at', { ascending: true })
          .limit(Math.max(ids.length, LOBBY_PAGE_SIZE)),
      'joined',
    );
    return rows
      .map(normalizeChallenge)
      .filter((row) => ids.includes(row.id) && isLobbyStatus(row.status));
  });

  const invitedPromise = fetchInvitedChallengeIds(userId)
    .then(async (ids) => {
      if (ids.length === 0) {
        return [] as Challenge[];
      }
      const rows = await selectChallengeList(
        (query) =>
          query
            .in('id', ids)
            .order('starts_at', { ascending: true })
            .limit(Math.max(ids.length, LOBBY_PAGE_SIZE)),
        'invited-mine',
      );
      return rows.map(normalizeChallenge).filter((row) => ids.includes(row.id) && isLobbyStatus(row.status));
    })
    .catch((error) => {
      console.log('[blob:lobby] invited-mine skipped', error);
      return [] as Challenge[];
    });

  const [created, joined, invited] = await Promise.all([
    createdPromise,
    joinedPromise,
    invitedPromise,
  ]);
  const visible = sortMyLobby(mergeChallenges(created, joined, invited));
  console.log('[blob:lobby] mine', {
    count: visible.length,
    created: created.length,
    joined: joined.length,
    invited: invited.length,
    titles: visible.map((row) => row.title),
  });
  return visible;
}

export async function fetchLobbyChallenges(userId?: string): Promise<Challenge[]> {
  const [discover, joined] = await Promise.all([
    fetchDiscoverChallenges(userId).catch((error) => {
      console.log('[blob:lobby] discover failed', error);
      return [] as Challenge[];
    }),
    fetchJoinedLobbyChallenges(userId).catch((error) => {
      console.log('[blob:lobby] joined failed', error);
      return [] as Challenge[];
    }),
  ]);
  const rows = mergeChallenges(joined, discover);
  if (rows.length === 0) {
    const fallback = await selectChallengeList(
      (query) => query.order('created_at', { ascending: false }).limit(LOBBY_PAGE_SIZE),
      'fallback',
    );
    return sortOfficialFirst(
      fallback
        .map(normalizeChallenge)
        .filter(
          (row) =>
            isLobbyStatus(row.status) &&
            !isInviteOnlyChallenge(row) &&
            (isListedVisibility(row.visibility) || row.is_official),
        ),
    );
  }
  return sortOfficialFirst(rows);
}

export async function fetchChallengeById(id: string): Promise<Challenge> {
  let lastError: string | null = null;

  for (const columns of LOBBY_SELECTS) {
    const { data, error } = await challengeList().select(columns).eq('id', id).maybeSingle();
    if (error) {
      lastError = error.message;
      console.log('[blob:challenge] select failed', { columns, message: error.message });
      continue;
    }
    if (!data) {
      continue;
    }
    return normalizeChallenge(data);
  }

  const reason = await supabase.rpc('challenge_access_reason', { p_challenge_id: id });
  if (reason.data === 'geo') {
    throw new Error(copy('geo.unavailable'));
  }
  throw new Error(getErrorMessage(lastError ?? 'Challenge not found'));
}

export type ChallengeShareState = {
  reason: 'ok' | 'geo' | 'hidden';
  title: string | null;
};

export async function fetchChallengeShareState(id: string): Promise<ChallengeShareState> {
  const { data, error } = await supabase
    .from('challenges')
    .select('id, title')
    .eq('id', id)
    .maybeSingle();
  if (!error && data) {
    return { reason: 'ok', title: String((data as { title?: string }).title ?? '') || null };
  }
  const reason = await supabase.rpc('challenge_access_reason', { p_challenge_id: id });
  if (reason.data === 'geo') {
    return { reason: 'geo', title: null };
  }
  return { reason: 'hidden', title: null };
}

export async function joinChallenge(challengeId: string): Promise<ChallengeParticipant> {
  const { data: session } = await supabase.auth.getUser();
  const userId = session.user?.id;
  if (!userId) {
    throw new Error('You need to be signed in.');
  }
  const charged = await getPaymentsProvider().chargeJoin({
    userId,
    challengeId,
    amountCents: 0,
    currency: 'coins',
  });
  if (!charged.ok) {
    throw new Error(charged.message);
  }
  const { maybeRequestPushPermission } = await import('@/lib/push');
  void maybeRequestPushPermission();
  const { data, error } = await supabase
    .from('challenge_participants')
    .select('id, challenge_id, user_id, status, days_completed, joined_at, completed_at, eliminated_at')
    .eq('challenge_id', challengeId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  const row = data as ChallengeParticipant | null;
  if (!row) {
    throw new Error('Join finished but we couldn’t load your competitor spot.');
  }
  return {
    ...row,
    days_completed: Number(row.days_completed ?? 0),
    eliminated_at: row.eliminated_at ?? null,
    completed_at: row.completed_at ?? null,
  };
}

export async function withParticipantCounts(
  rows: Challenge[],
): Promise<ChallengeWithStats[]> {
  const ids = rows.map((row) => row.id);
  const counts = new Map<string, number>();

  if (ids.length > 0) {
    const { data, error } = await supabase
      .from('challenge_participants')
      .select('challenge_id, status')
      .in('challenge_id', ids)
      .in('status', ['joined', 'active', 'completed']);
    if (!error) {
      for (const row of data ?? []) {
        counts.set(row.challenge_id, (counts.get(row.challenge_id) ?? 0) + 1);
      }
    } else {
      const fallback = await supabase
        .from('challenge_participants')
        .select('challenge_id')
        .in('challenge_id', ids);
      if (!fallback.error) {
        for (const row of fallback.data ?? []) {
          counts.set(row.challenge_id, (counts.get(row.challenge_id) ?? 0) + 1);
        }
      }
    }
  }

  return rows.map((challenge) => ({
    ...challenge,
    participant_count: counts.get(challenge.id) ?? 0,
  }));
}

/** Distinct followed users who are joined/active on each challenge. Soft-fails to 0. */
export async function fetchLobbyFriendCounts(
  userId: string,
  challengeIds: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!userId || challengeIds.length === 0) {
    return counts;
  }
  try {
    const { data: follows, error: followError } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', userId);
    if (followError) {
      // TODO: friend_count — follows graph not ready or RLS blocked.
      console.log('[blob:lobby] friend_count follows skipped', followError.message);
      return counts;
    }
    const friendIds = [
      ...new Set((follows ?? []).map((row) => row.following_id).filter(Boolean)),
    ];
    if (friendIds.length === 0) {
      return counts;
    }
    const { data: participants, error } = await supabase
      .from('challenge_participants')
      .select('challenge_id, user_id, status')
      .in('challenge_id', challengeIds)
      .in('user_id', friendIds)
      .in('status', ['joined', 'active']);
    if (error) {
      console.log('[blob:lobby] friend_count participants skipped', error.message);
      return counts;
    }
    const seen = new Set<string>();
    for (const row of participants ?? []) {
      const key = `${row.challenge_id}:${row.user_id}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      counts.set(row.challenge_id, (counts.get(row.challenge_id) ?? 0) + 1);
    }
    return counts;
  } catch (error) {
    console.log('[blob:lobby] friend_count hook failed', error);
    return counts;
  }
}

export function requiredProofTypes(
  challenge: Pick<Challenge, 'proof_requirements' | 'challenge_type' | 'tasks' | 'proofs' | 'proof_type'> | null | undefined,
): ProofType[] {
  if (isPointsChallenge(challenge)) {
    const fromTasks = (challenge?.tasks ?? [])
      .filter((task) => task.proof_required)
      .flatMap((task) => task.proof_types ?? []);
    const unique = [...new Set(fromTasks)].filter(Boolean) as ProofType[];
    if (unique.length > 0) {
      return unique.slice(0, 3);
    }
    if ((challenge?.tasks ?? []).some((task) => task.proof_required)) {
      return ['photo'];
    }
    return ['text_note'];
  }

  const named = requiredChallengeProofs(challenge);
  const fromNamed = named
    .map((proof) => {
      if (proof.method === 'honor') {
        return null;
      }
      if (proof.method === 'video') {
        return 'video' as ProofType;
      }
      if (proof.method === 'checkin') {
        return 'text_note' as ProofType;
      }
      if (proof.method === 'hr') {
        return 'hr_monitor' as ProofType;
      }
      return 'photo' as ProofType;
    })
    .filter((type): type is ProofType => type != null);
  if (fromNamed.length > 0 || named.some((proof) => proof.method === 'honor')) {
    return fromNamed;
  }

  const listed = (challenge?.proof_requirements ?? DEFAULT_PROOFS)
    .filter((item) => item?.required !== false)
    .map((item) => item.type)
    .filter(Boolean);
  return listed.length > 0 ? listed : [...PROOF_TYPES];
}

export function requiredChallengeProofs(
  challenge: Pick<Challenge, 'proofs' | 'proof_type' | 'proof_requirements' | 'challenge_type' | 'tasks'> | null | undefined,
): ChallengeProof[] {
  if (isPointsChallenge(challenge)) {
    const types = requiredProofTypes(challenge);
    return namedProofsFromLegacyTypes(types);
  }
  return resolveChallengeProofs({
    proofs: challenge?.proofs,
    proof_type: challenge?.proof_type,
    proof_requirements: challenge?.proof_requirements,
  });
}

async function ensureCreatorParticipant(challengeId: string) {
  const { data: session } = await supabase.auth.getUser();
  const userId = session.user?.id;
  if (!userId) {
    return;
  }
  const { data } = await supabase
    .from('challenge_participants')
    .select('id')
    .eq('challenge_id', challengeId)
    .eq('user_id', userId)
    .maybeSingle();
  if (data) {
    return;
  }
  const charged = await getPaymentsProvider().chargeJoin({
    userId,
    challengeId,
    amountCents: 0,
    currency: 'coins',
  });
  if (!charged.ok) {
    const message = charged.message.toLowerCase();
    if (message.includes('already joined') || message.includes('already_joined')) {
      return;
    }
    throw new Error(charged.message);
  }
}

export async function insertUserChallenge(input: CreateChallengeInput): Promise<Challenge> {
  try {
    return await insertUserChallengeInner(input);
  } catch (error) {
    logPostgrestError('create', error);
    throw new Error(getCreateChallengeMessage(error));
  }
}

async function insertUserChallengeInner(input: CreateChallengeInput): Promise<Challenge> {
  const lane = applyLaneForPublish({
    challenge_lane: input.challenge_lane,
    visibility: input.visibility,
    currency: input.currency,
    buy_in_amount: input.buy_in_amount,
    host_funded: input.host_funded,
  });
  const participating = input.creator_participating !== false;
  const result = await publishChallenge({
    title: input.title,
    description: input.description,
    rules: input.rules,
    category: input.category,
    visibility: lane.visibility,
    challenge_lane: lane.challenge_lane,
    challenge_type: input.challenge_type,
    start_mode: 'fixed',
    starts_at: input.starts_at,
    end_mode: input.is_unlimited ? 'indefinite_lms' : input.end_mode ?? 'length',
    ends_at: input.ends_at,
    length_value: input.is_unlimited ? null : input.length_value ?? undefined,
    length_unit: input.is_unlimited ? null : input.length_unit ?? 'days',
    is_unlimited: input.is_unlimited,
    max_participants: input.max_participants,
    min_participants: input.min_participants ?? 2,
    buy_in_amount: lane.buy_in_amount,
    currency: lane.currency,
    creator_participating: participating,
    creator_participates: participating,
    cover_image_url: input.cover_image_url ?? null,
    rules_video_url: input.rules_video_url ?? null,
    days_required: input.days_required,
    min_minutes: input.min_minutes,
    proof_requirements: input.proof_requirements,
    tasks: input.tasks,
    rules_list: input.rules_list ?? [],
    rules_structured: input.rules_list ?? undefined,
    prize_structure: input.prize_structure,
    top_places_mode: input.top_places_mode,
    top_places_value: input.top_places_value,
    top_places_distribution: input.top_places_distribution,
    funding_model: input.funding_model,
    creator_contribution: input.creator_contribution,
    frequency: input.frequency,
    target_count: input.target_count,
    host_funded: input.host_funded ?? lane.currency === 'bucks',
    host_budget: input.host_budget ?? input.creator_contribution,
    format: input.format ?? input.challenge_type,
    task: input.task ?? null,
    required_checkins: input.required_checkins ?? input.target_count,
    misses_allowed: input.misses_allowed ?? 0,
    proof_type: input.proof_type ?? null,
    proofs: input.proofs ?? null,
    proof_review: input.proof_review ?? 'auto',
    payout_mode: input.payout_mode ?? 'even_split_remaining',
    timezone: input.timezone ?? null,
    start_rule: input.start_rule ?? 'at_starts_at',
    is_official: false,
    discoverability: input.discoverability ?? null,
  }, input.draft_id);
  const { maybeRequestPushPermission } = await import('@/lib/push');
  void maybeRequestPushPermission();
  if (participating) {
    await ensureCreatorParticipant(result.challenge_id);
  }
  if (input.discoverability === 'invite_only' || input.discoverability === 'friends_of_friends') {
    const { error } = await supabase
      .from('challenges')
      .update({ discoverability: input.discoverability })
      .eq('id', result.challenge_id)
      .eq('created_by', input.created_by);
    if (error) {
      console.log('[blob:create] discoverability skipped', error.message);
    }
  }
  return fetchChallengeById(result.challenge_id);
}

export async function resolveStartRoll(challengeId: string, keep: boolean): Promise<Challenge> {
  const { data, error } = await supabase.rpc('resolve_start_roll', {
    p_challenge_id: challengeId,
    p_keep: keep,
  });
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  return normalizeChallenge((data ?? {}) as ChallengeRow);
}

export async function nudgeChallengeStart(challengeId: string): Promise<Challenge> {
  const { data, error } = await supabase.rpc('nudge_challenge_start', {
    p_challenge_id: challengeId,
  });
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  return normalizeChallenge((data ?? {}) as ChallengeRow);
}

export async function updateUserChallenge(
  challengeId: string,
  payload: Record<string, unknown>,
): Promise<Challenge> {
  const { data, error } = await supabase.rpc('update_user_challenge', {
    p_challenge_id: challengeId,
    p_payload: payload,
  });
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  return normalizeChallenge((data ?? {}) as ChallengeRow);
}
