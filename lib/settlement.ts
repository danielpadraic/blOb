import { closeChallengeForJudging, distributeChallenge } from '@/lib/api/challenges';
import { PUBLIC_PROFILE_COLUMNS } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import { getPaymentsProvider } from '@/services/payments';
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
import type { CloseChallengeForJudgingResult } from '@/lib/types/challenge';
import { getErrorMessage } from '@/utils/errors';
import { compactCountdown, formatRelative } from '@/utils/format';
import { formatWallet } from '@/lib/currency';
import { officialBob } from '@/copy/officialBob';
import {
  FORFEIT_RECEIPT,
  voidReceiptCopy,
  type SettlementVoidKind,
} from '@/lib/settlement/receipts';
import { isEvenSplitAutoSettle } from '@/lib/settlement/lifecycle';
import { settlementRpcForPayout, type EvenSplitPayoutInput } from '@/lib/settlement/payout';
import {
  getChallengeSettlementWithClient,
  settleEndedChallengeWithClient,
  tickSettlementsWithClient,
} from '@/lib/settlement/rpc';

export {
  LIFECYCLE_LABELS,
  isEvenSplitAutoSettle,
  lifecycleLabel,
  lifecyclePhase,
  shouldAutoSettle,
} from '@/lib/settlement/lifecycle';
export {
  isEvenSplitPayout,
  settlePayoutConfirmCopy,
  settlementRpcForPayout,
} from '@/lib/settlement/payout';
export { rankedShares, resultWhyCopy } from '@/lib/settlement/rankedShares';
export {
  FORFEIT_RECEIPT,
  formatSettlementAmount,
  nobodyFinishedRuleCopy,
  receiptHeadline,
  settlementVoidKind,
  voidReceiptCopy,
} from '@/lib/settlement/receipts';
import { settlementErrorCopy } from '@/lib/settlement/errors';
export { classifySettlementError, settlementErrorCopy } from '@/lib/settlement/errors';
export {
  nonWinnerSettledNotifyCopy,
  splitSettledNotifyCopy,
  walletAmountLabel,
  winnerSettledNotifyCopy,
} from '@/lib/settlement/notify';
export { trySettleIfEndedWithClient } from '@/lib/settlement/rpc';

const JOINABLE_STATUSES: ChallengeStatus[] = [
  'upcoming',
  'open',
  'starting',
  'filling',
  'arming',
  'in_progress',
];

const CLOSED_JOIN_STATUSES: ChallengeStatus[] = [
  'live',
  'ended',
  'settling',
  'judging',
  'settled',
  'cancelled',
  'cancelled_underfilled',
  'distributing',
];

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
    series_id?: string | null;
  },
): boolean {
  const status = String(challenge.status ?? '');
  if (challenge.series_id || challenge.is_official) {
    return status === 'filling' || status === 'arming';
  }
  if (CLOSED_JOIN_STATUSES.includes(status as ChallengeStatus)) {
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
    status?: string | null;
  },
  _now = new Date(),
): boolean {
  return String(challenge.status ?? '') === 'live';
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
    return 'Check-in opens when the challenge starts.';
  }
  return `Check-in opens when the challenge starts ${formatRelative(opens)}.`;
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
  const countdown = compactCountdown(opens, now);
  return countdown === 'now' ? 'Starts soon' : `Starts in ${countdown}`;
}

export function isClosedForLogs(challenge: {
  status?: string | null;
  ends_at?: string | null;
  is_unlimited?: boolean | null;
  eliminated?: boolean | null;
}): boolean {
  if (String(challenge.status ?? '') !== 'live') {
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
  challenge: Pick<Challenge, 'status' | 'created_by' | 'ends_at' | 'is_unlimited'> & {
    prize_structure?: string | null;
    end_mode?: string | null;
    challenge_type?: string | null;
    payout_mode?: string | null;
    format?: string | null;
  },
  userId: string | undefined,
  now = new Date(),
): boolean {
  if (isEvenSplitAutoSettle(challenge)) {
    return false;
  }
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
  challenge: Pick<Challenge, 'status' | 'created_by' | 'distributed_at' | 'is_unlimited' | 'ends_at'> & {
    prize_structure?: string | null;
    end_mode?: string | null;
    challenge_type?: string | null;
    payout_mode?: string | null;
    format?: string | null;
  },
  userId: string | undefined,
): boolean {
  if (isEvenSplitAutoSettle(challenge)) {
    return false;
  }
  if (!isHostOfChallenge(challenge, userId)) {
    return false;
  }
  if (challenge.is_unlimited || !challenge.ends_at) {
    return false;
  }
  if (challenge.distributed_at || challenge.status === 'settled' || challenge.status === 'cancelled') {
    return false;
  }
  const status = String(challenge.status ?? '');
  return (
    status === 'ended' ||
    status === 'settling' ||
    status === 'judging' ||
    status === 'distributing'
  );
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
  official?: boolean;
  winnerCount?: number | null;
  voidKind?: SettlementVoidKind;
}): string {
  if (!input.joined) {
    return 'You were not in this challenge.';
  }
  if (input.voidKind && input.voidKind !== 'historical_forfeit') {
    return voidReceiptCopy(input.voidKind);
  }
  if (Number(input.winnerCount) === 0) {
    return FORFEIT_RECEIPT;
  }
  if (input.official) {
    if (input.payout && Number(input.payout.amount) > 0) {
      return `${officialBob('finished')} ${officialBob('finishedShare')}`;
    }
    return officialBob('stillWon');
  }
  if (input.payout && Number(input.payout.amount) > 0) {
    return `You received ${formatWallet(input.payout.amount, input.currency)}.`;
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

export async function fetchSettledPrizePools(ids: string[]): Promise<Map<string, number>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const pots = new Map<string, number>();
  if (unique.length === 0) {
    return pots;
  }
  const { data, error } = await supabase
    .from('challenge_settlements')
    .select('challenge_id, prize_pool')
    .in('challenge_id', unique);
  if (error) {
    console.log('[blob:settlement] pots skipped', error.message);
    return pots;
  }
  for (const row of data ?? []) {
    const id = String(row.challenge_id ?? '');
    if (!id) {
      continue;
    }
    pots.set(id, Math.max(Number(row.prize_pool) || 0, 0));
  }
  return pots;
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
      .select('id, challenge_id, user_id, amount, created_at')
      .eq('challenge_id', challengeId)
      .order('created_at', { ascending: true });

    const settlement = asSettlement(data as Record<string, unknown>);
    const fromTable = (payoutsQuery.data ?? []).map((row) => asPayout(row as Record<string, unknown>));
    const slices = settlement.slices ?? [];
    const payouts = (fromTable.length > 0 ? fromTable : slices).map((row, index) => {
      if (row.reason) {
        return row;
      }
      const match =
        slices.find(
          (slice) => slice.user_id === row.user_id && Number(slice.amount) === Number(row.amount),
        ) ?? slices[index];
      return match?.reason ? { ...row, reason: match.reason } : row;
    });

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

async function fetchPayoutHint(challengeId: string): Promise<EvenSplitPayoutInput | null> {
  const { data, error } = await supabase
    .from('challenges')
    .select('prize_structure, payout_mode, format, challenge_type, is_unlimited, end_mode')
    .eq('id', challengeId)
    .maybeSingle();
  if (error || !data) {
    return null;
  }
  return data as EvenSplitPayoutInput;
}

async function viewFromDistributedPayouts(
  challengeId: string,
): Promise<ChallengeSettlementView | null> {
  try {
    const challengeQuery = await supabase
      .from('challenges')
      .select('id, created_by, prize_pool, prize_structure, distributed_at, status')
      .eq('id', challengeId)
      .maybeSingle();
    const row = challengeQuery.data as Record<string, unknown> | null;
    if (!row) {
      return null;
    }
    const payoutsQuery = await supabase
      .from('challenge_payouts')
      .select('id, challenge_id, user_id, amount, created_at')
      .eq('challenge_id', challengeId)
      .order('created_at', { ascending: true });
    const payouts = (payoutsQuery.data ?? []).map((item) => asPayout(item as Record<string, unknown>));
    const settled = Boolean(row.distributed_at) || String(row.status ?? '') === 'settled' || payouts.length > 0;
    if (!settled) {
      return null;
    }
    const distributed = payouts.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
    return {
      already_settled: true,
      settlement: {
        id: challengeId,
        challenge_id: challengeId,
        settled_by: (row.created_by as string | null) ?? null,
        prize_pool: Number(row.prize_pool ?? distributed),
        distributed,
        prize_structure: String(row.prize_structure ?? 'winner_take_all'),
        winner_count: payouts.length,
        settled_at: String(row.distributed_at ?? new Date().toISOString()),
        slices: payouts,
      },
      payouts: await withPayoutProfiles(payouts),
    };
  } catch (error) {
    console.log('[blob:settlement] distribute receipt skipped', error);
    return null;
  }
}

async function settleEvenSplitChallenge(challengeId: string): Promise<ChallengeSettlementView> {
  try {
    return await settleEndedChallengeWithClient(supabase, challengeId);
  } catch (error) {
    const existing = await fetchChallengeSettlement(challengeId);
    if (existing) {
      return existing;
    }
    const { data: session } = await supabase.auth.getUser();
    const userId = session.user?.id ?? '';
    try {
      await getPaymentsProvider().payout({
        userId,
        amountCents: 0,
        challengeId,
      });
    } catch (legacy) {
      const message = getErrorMessage(legacy);
      if (message === 'Already paid out.') {
        const paid = await fetchChallengeSettlement(challengeId);
        if (paid) {
          return paid;
        }
      }
      throw error instanceof Error ? error : new Error(settlementErrorCopy(error));
    }
    const after = await fetchChallengeSettlement(challengeId);
    if (after) {
      return after;
    }
    throw error instanceof Error ? error : new Error(settlementErrorCopy(error));
  }
}

async function settleRankedChallenge(challengeId: string): Promise<ChallengeSettlementView> {
  try {
    await distributeChallenge(challengeId);
  } catch (error) {
    const existing =
      (await fetchChallengeSettlement(challengeId)) ?? (await viewFromDistributedPayouts(challengeId));
    if (existing) {
      return existing;
    }
    throw new Error(settlementErrorCopy(error));
  }
  const view =
    (await fetchChallengeSettlement(challengeId)) ??
    (await getChallengeSettlementWithClient(supabase, challengeId)) ??
    (await viewFromDistributedPayouts(challengeId));
  if (view) {
    return view;
  }
  throw new Error('Prize moved, but the receipt did not load. Open this challenge again.');
}

export async function settleChallenge(
  challengeId: string,
  hint?: EvenSplitPayoutInput | null,
): Promise<ChallengeSettlementView> {
  const payout = (await fetchPayoutHint(challengeId)) ?? hint ?? null;
  if (!payout) {
    throw new Error('Could not read how this prize is paid.');
  }
  if (settlementRpcForPayout(payout) === 'settle_ended_challenge') {
    return settleEvenSplitChallenge(challengeId);
  }
  return settleRankedChallenge(challengeId);
}

export async function trySettleIfEnded(challengeId: string): Promise<ChallengeSettlementView | null> {
  await tickSettlementsWithClient(supabase);
  return (
    (await getChallengeSettlementWithClient(supabase, challengeId)) ??
    (await fetchChallengeSettlement(challengeId))
  );
}

const SYNC_STATUSES_MIN_INTERVAL_MS = 15_000;
let lastStatusSyncAt = 0;
let statusSyncInFlight: Promise<void> | null = null;
let statusSyncMissing = false;
let statusSyncMissingLogged = false;

function isMissingStatusSyncRpc(error: { message?: string; code?: string; status?: number } | null): boolean {
  if (!error) {
    return false;
  }
  const code = String(error.code ?? '');
  const status = Number(error.status ?? 0);
  const message = String(error.message ?? '').toLowerCase();
  return (
    status === 404 ||
    status === 405 ||
    code === '404' ||
    code === '405' ||
    code === 'PGRST202' ||
    message.includes('404') ||
    message.includes('405') ||
    message.includes('could not find the function') ||
    message.includes('does not exist') ||
    message.includes('schema cache')
  );
}

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
    if (!statusSyncMissing) {
      const { error } = await supabase.rpc('sync_challenge_statuses');
      if (error && isMissingStatusSyncRpc(error)) {
        statusSyncMissing = true;
        if (!statusSyncMissingLogged) {
          statusSyncMissingLogged = true;
          console.log('[blob:challenge]', 'sync_challenge_statuses missing', error.message);
        }
      } else if (error) {
        console.log('[blob:status] sync skipped', error.message);
      }
    }
    try {
      await tickSettlementsWithClient(supabase);
    } catch (tickError) {
      console.log('[blob:status] settlement tick skipped', tickError);
    }
  })().finally(() => {
    statusSyncInFlight = null;
  });
  return statusSyncInFlight;
}
