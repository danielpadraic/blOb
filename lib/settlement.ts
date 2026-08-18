import { closeChallengeForJudging, distributeChallenge } from '@/lib/api/challenges';
import { PUBLIC_PROFILE_COLUMNS } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import type {
  Challenge,
  ChallengePayout,
  ChallengePayoutWithProfile,
  ChallengeSettlement,
  ChallengeSettlementView,
  ChallengeStatus,
  PublicProfile,
  WalletCurrency,
} from '@/lib/types';
import type { CloseChallengeForJudgingResult, DistributeChallengeResult } from '@/lib/types/challenge';
import { getErrorMessage } from '@/utils/errors';
import { formatRelative } from '@/utils/format';
import { formatWallet } from '@/lib/currency';

const JOINABLE_STATUSES: ChallengeStatus[] = ['upcoming', 'open', 'starting', 'in_progress'];

export function isJoinableStatus(status: string | null | undefined): boolean {
  return JOINABLE_STATUSES.includes(status as ChallengeStatus);
}

export function isJoinWindowOpen(
  challenge: {
    status?: string | null;
    starts_at?: string | null;
    official_started_at?: string | null;
    start_rule?: string | null;
    is_official?: boolean | null;
  },
  now = new Date(),
): boolean {
  const status = String(challenge.status ?? '');
  if (challenge.is_official || challenge.start_rule !== 'at_starts_at') {
    if (challenge.official_started_at) {
      return false;
    }
    return isJoinableStatus(status);
  }
  if (status !== 'open') {
    return false;
  }
  if (challenge.starts_at && now.getTime() >= new Date(challenge.starts_at).getTime()) {
    return false;
  }
  return true;
}

export function isSettledStatus(status: string | null | undefined): boolean {
  return status === 'settled';
}

function parseChallengeInstant(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Latest of starts_at / official_started_at. Null if neither is a real time. */
export function challengeLoggingOpensAt(challenge: {
  starts_at?: string | null;
  official_started_at?: string | null;
}): Date | null {
  const scheduled = parseChallengeInstant(challenge.starts_at);
  const official = parseChallengeInstant(challenge.official_started_at);
  if (scheduled && official) {
    return official.getTime() > scheduled.getTime() ? official : scheduled;
  }
  return official ?? scheduled;
}

export function hasChallengeStarted(
  challenge: {
    starts_at?: string | null;
    official_started_at?: string | null;
  },
  now = new Date(),
): boolean {
  const opens = challengeLoggingOpensAt(challenge);
  if (!opens) {
    return true;
  }
  return now.getTime() >= opens.getTime();
}

export function loggingOpensHelper(
  challenge: {
    starts_at?: string | null;
    official_started_at?: string | null;
  },
  now = new Date(),
): string {
  const opens = challengeLoggingOpensAt(challenge);
  if (!opens || now.getTime() >= opens.getTime()) {
    return 'Logging opens when the challenge starts.';
  }
  return `Logging opens when the challenge starts ${formatRelative(opens)}.`;
}

export function startsInLabel(
  challenge: {
    starts_at?: string | null;
    official_started_at?: string | null;
  },
  now = new Date(),
): string | null {
  const opens = challengeLoggingOpensAt(challenge);
  if (!opens || now.getTime() >= opens.getTime()) {
    return null;
  }
  return `Starts ${formatRelative(opens)}`;
}

export function isClosedForLogs(challenge: {
  status?: string | null;
  ends_at?: string | null;
  is_unlimited?: boolean | null;
  eliminated?: boolean | null;
}): boolean {
  if (challenge.status === 'judging' || challenge.status === 'settled') {
    return true;
  }
  if (challenge.eliminated) {
    return true;
  }
  if (challenge.is_unlimited) {
    return false;
  }
  if (challenge.ends_at && new Date() >= new Date(challenge.ends_at)) {
    return true;
  }
  return false;
}

export function isHostOfChallenge(
  challenge: Pick<Challenge, 'created_by'>,
  userId: string | undefined,
): boolean {
  return Boolean(userId && challenge.created_by && challenge.created_by === userId);
}

export function hasChallengeEnded(
  challenge: {
    ends_at?: string | null;
    is_unlimited?: boolean | null;
    status?: string | null;
  },
  now = new Date(),
): boolean {
  if (challenge.is_unlimited || !challenge.ends_at) {
    return false;
  }
  const end = new Date(challenge.ends_at);
  if (Number.isNaN(end.getTime())) {
    return false;
  }
  return now.getTime() >= end.getTime();
}

export function canMarkJudging(
  challenge: Pick<Challenge, 'status' | 'created_by' | 'ends_at' | 'is_unlimited'>,
  userId: string | undefined,
  now = new Date(),
): boolean {
  if (!isHostOfChallenge(challenge, userId)) {
    return false;
  }
  if (challenge.is_unlimited || !challenge.ends_at) {
    return false;
  }
  const status = String(challenge.status ?? '');
  if (status === 'settled' || status === 'cancelled' || status === 'judging' || status === 'distributing') {
    return false;
  }
  return hasChallengeEnded(challenge, now);
}

export function canSettleChallenge(
  challenge: Pick<Challenge, 'status' | 'created_by' | 'distributed_at' | 'is_unlimited' | 'ends_at'>,
  userId: string | undefined,
): boolean {
  if (!isHostOfChallenge(challenge, userId)) {
    return false;
  }
  if (challenge.is_unlimited || !challenge.ends_at) {
    return false;
  }
  if (challenge.distributed_at || challenge.status === 'settled' || challenge.status === 'cancelled') {
    return false;
  }
  return challenge.status === 'judging' || challenge.status === 'distributing';
}

/** Payout unlocks 1 hour after judging_started_at, else 1 hour after ends_at. */
export function distributableAt(challenge: {
  judging_started_at?: string | null;
  ends_at?: string | null;
  is_unlimited?: boolean | null;
}): Date | null {
  if (challenge.is_unlimited) {
    return null;
  }
  const source = challenge.judging_started_at || challenge.ends_at;
  if (!source) {
    return null;
  }
  const base = new Date(source);
  if (Number.isNaN(base.getTime())) {
    return null;
  }
  return new Date(base.getTime() + 60 * 60 * 1000);
}

export function isDistributeGateOpen(
  challenge: {
    judging_started_at?: string | null;
    ends_at?: string | null;
    status?: string | null;
  },
  now = new Date(),
): boolean {
  const target = distributableAt(challenge);
  if (!target) {
    return false;
  }
  return now.getTime() >= target.getTime();
}

export function payoutCountdownLabel(target: Date, now = new Date()): string {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) {
    return 'now';
  }
  const totalSec = Math.max(Math.ceil(ms / 1000), 0);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours >= 1) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function completerCount(
  participants: Array<{
    days_completed?: number | null;
    status?: string | null;
    eliminated_at?: string | null;
  }>,
  daysRequired: number | null | undefined,
): number {
  const target = Math.max(Number(daysRequired) || 0, 0);
  return participants.filter((row) => {
    if (row.eliminated_at) {
      return false;
    }
    if (row.status === 'completed') {
      return true;
    }
    if (row.status === 'refunded_pre_start' || row.status === 'withdrawn') {
      return false;
    }
    return target > 0 && Number(row.days_completed ?? 0) >= target;
  }).length;
}

export function ordinal(place: number): string {
  const value = Math.floor(place);
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) {
    return `${value}th`;
  }
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

export function payoutDisplayName(payout: ChallengePayoutWithProfile): string {
  const profile = payout.profile;
  const name = profile?.display_name?.trim() || profile?.username?.trim();
  return name || 'A competitor';
}

export function personalSettlementCopy(input: {
  payout: ChallengePayout | null | undefined;
  prizeStructure?: string | null;
  daysCompleted?: number | null;
  targetCount?: number | null;
  joined: boolean;
  currency?: WalletCurrency | string | null;
}): string {
  if (!input.joined) {
    return 'You were not in this challenge.';
  }
  if (input.payout && Number(input.payout.amount) > 0) {
    return `You earned ${formatWallet(input.payout.amount, input.currency)}.`;
  }
  return 'No payout this time.';
}

function asSettlement(row: Record<string, unknown>): ChallengeSettlement {
  const parsed = parseDistributedField(row.distributed);
  return {
    id: String(row.id ?? row.challenge_id ?? ''),
    challenge_id: String(row.challenge_id),
    settled_by: (row.settled_by as string | null) ?? null,
    prize_pool: Number(row.prize_pool ?? 0),
    distributed: parsed.total,
    prize_structure: String(row.prize_structure ?? 'equal_split'),
    winner_count: Number(row.winner_count ?? parsed.slices.length ?? 0),
    settled_at: String(row.settled_at ?? row.distributed_at ?? new Date().toISOString()),
    slices: parsed.slices.length > 0 ? parsed.slices : undefined,
  };
}

function parseDistributedField(value: unknown): { total: number; slices: ChallengePayout[] } {
  if (Array.isArray(value)) {
    const slices = value
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }
        const row = item as Record<string, unknown>;
        const userId = String(row.user_id ?? row.userId ?? '');
        if (!userId) {
          return null;
        }
        return {
          user_id: userId,
          place: Number(row.place ?? 0),
          score: Number(row.score ?? 0),
          amount: Number(row.amount ?? 0),
          reason: String(row.reason ?? 'distribute_win'),
        } satisfies ChallengePayout;
      })
      .filter((row): row is ChallengePayout => Boolean(row));
    return {
      total: slices.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
      slices,
    };
  }
  return { total: Number(value ?? 0), slices: [] };
}

function asPayout(row: Record<string, unknown>): ChallengePayout {
  return {
    id: row.id ? String(row.id) : undefined,
    settlement_id: row.settlement_id ? String(row.settlement_id) : undefined,
    challenge_id: row.challenge_id ? String(row.challenge_id) : undefined,
    user_id: String(row.user_id),
    place: Number(row.place ?? 0),
    score: Number(row.score ?? 0),
    amount: Number(row.amount ?? 0),
    reason: String(row.reason ?? ''),
    created_at: row.created_at ? String(row.created_at) : undefined,
  };
}

async function withPayoutProfiles(
  payouts: ChallengePayout[],
): Promise<ChallengePayoutWithProfile[]> {
  const ids = [...new Set(payouts.map((row) => row.user_id))];
  if (ids.length === 0) {
    return payouts;
  }

  const { data, error } = await supabase
    .from('profiles_public')
    .select(PUBLIC_PROFILE_COLUMNS)
    .in('id', ids);
  if (error) {
    console.log('[blob:settlement] profiles skipped', error.message);
    return payouts;
  }

  const byId = new Map((data ?? []).map((row) => [row.id, row as PublicProfile]));
  return payouts.map((payout) => ({
    ...payout,
    profile: byId.get(payout.user_id) ?? null,
  }));
}

export async function fetchChallengeSettlement(
  challengeId: string,
): Promise<ChallengeSettlementView | null> {
  try {
    const { data, error } = await supabase
      .from('challenge_settlements')
      .select(
        'id, challenge_id, settled_by, prize_pool, distributed, prize_structure, winner_count, settled_at',
      )
      .eq('challenge_id', challengeId)
      .maybeSingle();

    if (error) {
      console.log('[blob:settlement] row skipped', error.message);
      return null;
    }
    if (!data) {
      return null;
    }

    const payoutsQuery = await supabase
      .from('challenge_payouts')
      .select('id, settlement_id, challenge_id, user_id, place, score, amount, reason, created_at')
      .eq('challenge_id', challengeId)
      .order('place', { ascending: true });

    const settlement = asSettlement(data as Record<string, unknown>);
    const fromTable = (payoutsQuery.data ?? []).map((row) => asPayout(row as Record<string, unknown>));
    const payouts = fromTable.length > 0 ? fromTable : settlement.slices ?? [];

    return {
      already_settled: true,
      settlement,
      payouts: await withPayoutProfiles(payouts),
    };
  } catch (error) {
    console.log('[blob:settlement] fetch skipped', error);
    return null;
  }
}

export async function markChallengeJudging(
  challengeId: string,
): Promise<CloseChallengeForJudgingResult> {
  return closeChallengeForJudging(challengeId);
}

export async function settleChallenge(challengeId: string): Promise<ChallengeSettlementView> {
  let result: DistributeChallengeResult;
  try {
    result = await distributeChallenge(challengeId);
  } catch (error) {
    const message = getErrorMessage(error);
    if (message === 'Already paid out.') {
      const existing = await fetchChallengeSettlement(challengeId);
      if (existing) {
        return existing;
      }
    }
    throw error;
  }

  const existing = await fetchChallengeSettlement(challengeId);
  if (existing) {
    return existing;
  }

  const slices = (result.distributed ?? [])
    .map((row) => {
      const userId = String(row.user_id ?? '');
      if (!userId) {
        return null;
      }
      return {
        user_id: userId,
        place: Number(row.place ?? 0),
        score: 0,
        amount: Number(row.amount ?? 0),
        reason: 'distribute_win',
      } satisfies ChallengePayout;
    })
    .filter((row): row is ChallengePayout => Boolean(row));

  return {
    already_settled: true,
    settlement: {
      id: challengeId,
      challenge_id: challengeId,
      settled_by: null,
      prize_pool: Number(result.paid ?? 0),
      distributed: Number(result.paid ?? slices.reduce((sum, row) => sum + row.amount, 0)),
      prize_structure: 'equal_split',
      winner_count: Number(result.winner_count ?? slices.length),
      settled_at: result.distributed_at ?? new Date().toISOString(),
      slices,
    },
    payouts: await withPayoutProfiles(slices),
  };
}

const SYNC_STATUSES_MIN_INTERVAL_MS = 15_000;
let lastStatusSyncAt = 0;
let statusSyncInFlight: Promise<void> | null = null;

export async function syncChallengeStatuses(): Promise<void> {
  const now = Date.now();
  if (statusSyncInFlight) {
    return statusSyncInFlight;
  }
  if (now - lastStatusSyncAt < SYNC_STATUSES_MIN_INTERVAL_MS) {
    return;
  }
  lastStatusSyncAt = now;
  statusSyncInFlight = (async () => {
    const { error } = await supabase.rpc('sync_challenge_statuses');
    if (error) {
      console.log('[blob:status] sync skipped', error.message);
    }
  })().finally(() => {
    statusSyncInFlight = null;
  });
  return statusSyncInFlight;
}
