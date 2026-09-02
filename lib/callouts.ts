import { addDays, addHours } from 'date-fns';

import {
  CALLOUT_PROOF_CAP,
  defaultChallengeProofs,
  ensureProofSentence,
  parseChallengeProofs,
  proofsForStorage,
  type ChallengeProof,
} from '@/lib/challengeProofs';
import { isEndedPrizeStatus } from '@/lib/challengePot';
import { asWalletCurrency } from '@/lib/currency';
import { PUBLIC_PROFILE_COLUMNS } from '@/lib/constants';
import { challengeDetailHref } from '@/lib/routes';
import { fetchBlockedPeerIds, fetchFriends, otherFriendshipUserId } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import { THEME } from '@/lib/theme';
import type { Callout, CalloutFormat, CalloutObserver, CalloutStatus, PublicProfile, WalletCurrency } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';

const CALLOUT_COLUMNS =
  'id, challenger_id, opponent_id, currency, stake_amount, win_condition, deadline, status, held, challenger_pick, opponent_pick, winner_id, challenger_cancel_at, opponent_cancel_at, challenge_id, proofs, format, created_at, updated_at';

export const CALLOUT_TITLE_PREFIX = 'Callout:';
export const CALLOUT_TASK_PLACEHOLDER = '30-min skill';
export const CALLOUT_WATCHING_LINE = 'Watching — no entry, no prize.';
export const CALLOUT_CHEER_PLACEHOLDER = 'Cheer them on…';

export type CalloutDeadlinePreset = '24h' | '3d' | '7d';

export const CALLOUT_FORMATS: { value: CalloutFormat; label: string }[] = [
  { value: 'consistency', label: 'Consistency' },
  { value: 'points', label: 'Points' },
];

export function calloutFormatOf(value: unknown): CalloutFormat {
  return String(value ?? '').toLowerCase() === 'points' ? 'points' : 'consistency';
}

/** 1–3 required proofs. Empty create = one photo + caption. */
export function calloutProofsForCreate(proofs?: ChallengeProof[] | null): ChallengeProof[] {
  const list = (proofs?.length ? proofs : defaultChallengeProofs())
    .slice(0, CALLOUT_PROOF_CAP)
    .map((proof) => ensureProofSentence(proof, proof.minutes ?? 30));
  return list.length > 0 ? list : defaultChallengeProofs();
}

export function calloutRankedWinner(input: {
  format?: CalloutFormat | string | null;
  disputed?: boolean;
  challenger: { id: string; complete: boolean; days: number; points: number };
  opponent: { id: string; complete: boolean; days: number; points: number };
}): string | null {
  if (input.disputed || !input.challenger.complete || !input.opponent.complete) {
    return null;
  }
  if (calloutFormatOf(input.format) === 'points') {
    if (input.challenger.points === input.opponent.points) {
      return null;
    }
    return input.challenger.points > input.opponent.points ? input.challenger.id : input.opponent.id;
  }
  if (input.challenger.days === input.opponent.days) {
    return null;
  }
  return input.challenger.days > input.opponent.days ? input.challenger.id : input.opponent.id;
}

export function calloutHonorNeeded(
  input: Parameters<typeof calloutRankedWinner>[0],
): boolean {
  return !calloutRankedWinner(input);
}

const ROSTER_OUT = new Set(['withdrawn', 'refunded_pre_start']);

export function calloutTask(value: string | null | undefined): string {
  const trimmed = String(value ?? '').trim();
  if (trimmed.toLowerCase().startsWith(CALLOUT_TITLE_PREFIX.toLowerCase())) {
    return trimmed.slice(CALLOUT_TITLE_PREFIX.length).trim();
  }
  return trimmed;
}

export function calloutTitle(value: string | null | undefined): string {
  const task = calloutTask(value);
  return task ? `${CALLOUT_TITLE_PREFIX} ${task}` : CALLOUT_TITLE_PREFIX;
}

export function calloutTaskOk(value: string | null | undefined): boolean {
  return calloutTask(value).length >= 3;
}

export function asCallout(row: Callout & { title?: string | null }): Callout {
  const status = String(row.status ?? 'pending');
  return {
    ...row,
    currency: asWalletCurrency(row.currency),
    stake_amount: Number(row.stake_amount),
    held: Boolean(row.held),
    win_condition: calloutTitle(row.win_condition || row.title || ''),
    deadline: row.deadline || row.created_at,
    challenge_id: row.challenge_id ?? null,
    format: calloutFormatOf(row.format),
    proofs: calloutProofsForCreate(parseChallengeProofs((row as { proofs?: unknown }).proofs)),
    status: (status === 'resolved' ? 'settled' : status) as CalloutStatus,
    challenger_pick: row.challenger_pick ?? null,
    opponent_pick: row.opponent_pick ?? null,
    winner_id: row.winner_id ?? null,
    challenger_cancel_at: row.challenger_cancel_at ?? null,
    opponent_cancel_at: row.opponent_cancel_at ?? null,
  };
}

export function isCalloutChallenge(row?: { is_callout?: boolean | null } | null): boolean {
  return Boolean(row?.is_callout);
}

/** Gold token on lobby / Home cards. Full Callout chrome is a later slice. */
export function calloutCardBorder(isCallout?: boolean | null): string | undefined {
  return isCallout ? THEME.callout : undefined;
}

/** After accept, fighters open Overview; watchers open Live. Pending stays on the Callout screen. */
export function calloutActiveChallengeHref(
  callout?: { challenge_id?: string | null; status?: string | null } | null,
  opts?: { tab?: 'overview' | 'feed' },
): string | null {
  const id = String(callout?.challenge_id ?? '').trim();
  if (!id || callout?.status === 'pending') {
    return null;
  }
  return String(challengeDetailHref(id, 'lobby', null, { tab: opts?.tab ?? 'overview' }));
}

export function isCalloutChallengeObserver(
  callout: Pick<Callout, 'challenger_id' | 'opponent_id'> | null | undefined,
  watchingIds: Iterable<string> | null | undefined,
  userId?: string | null,
): boolean {
  if (!userId || !callout || isCalloutFighter(callout, userId)) {
    return false;
  }
  for (const id of watchingIds ?? []) {
    if (id === userId) {
      return true;
    }
  }
  return false;
}

export function calloutWatchingCountLabel(count: number): string {
  const n = Math.max(0, Math.floor(count));
  if (n <= 0) {
    return '';
  }
  return n === 1 ? '1 watching' : `${n} watching`;
}

/** Watcher invite opens Live when the challenge exists, else the Callout screen. */
export function calloutObserverInviteHref(data?: {
  challenge_id?: string | null;
  callout_id?: string | null;
} | null): string | null {
  const challengeId = String(data?.challenge_id ?? '').trim();
  if (challengeId) {
    return String(challengeDetailHref(challengeId, 'lobby', null, { tab: 'feed' }));
  }
  const calloutId = String(data?.callout_id ?? '').trim();
  return calloutId ? `/challenges/callout/${calloutId}` : null;
}

function asCalloutResult(data: unknown): Callout {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('The call-out finished but we couldn’t load it.');
  }
  return asCallout(row as Callout);
}

export function deadlineFromPreset(preset: CalloutDeadlinePreset): string {
  const now = new Date();
  if (preset === '24h') {
    return addHours(now, 24).toISOString();
  }
  if (preset === '3d') {
    return addDays(now, 3).toISOString();
  }
  return addDays(now, 7).toISOString();
}

export function isCalloutRosterLive(status?: string | null): boolean {
  const value = String(status ?? '');
  return Boolean(value) && value !== 'draft' && !isEndedPrizeStatus(value);
}

export function isCalloutRosterSeat(status?: string | null): boolean {
  return !ROSTER_OUT.has(String(status ?? ''));
}

export function isCalloutFighter(
  callout: Pick<Callout, 'challenger_id' | 'opponent_id'>,
  userId?: string | null,
): boolean {
  return Boolean(userId && (userId === callout.challenger_id || userId === callout.opponent_id));
}

export function pendingHomeCallouts(
  rows: Callout[] | null | undefined,
  viewerId?: string | null,
): Callout[] {
  return (rows ?? []).filter((row) => {
    if (row.status !== 'pending') {
      return false;
    }
    if (!viewerId) {
      return true;
    }
    return isCalloutFighter(row, viewerId);
  });
}

export function selectCalloutOpponentIds(input: {
  me: string;
  friends: string[];
  rosterMates: string[];
  blocked: Iterable<string>;
  pendingPairIds: Iterable<string>;
}): string[] {
  const blocked = new Set(input.blocked);
  const pending = new Set(input.pendingPairIds);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [...input.friends, ...input.rosterMates]) {
    if (!id || id === input.me || blocked.has(id) || pending.has(id) || seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function selectCalloutObserverIds(input: {
  me: string;
  fighters: string[];
  friends: string[];
  rosterMates: string[];
  blocked: Iterable<string>;
  alreadyWatching: Iterable<string>;
}): string[] {
  const exclude = new Set<string>([
    input.me,
    ...input.fighters,
    ...input.blocked,
    ...input.alreadyWatching,
  ]);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [...input.friends, ...input.rosterMates]) {
    if (!id || exclude.has(id) || seen.has(id)) {
      continue;
    }
    seen.add(id);
    out.push(id);
  }
  return out;
}

export function filterCalloutPeople(people: PublicProfile[], query: string): PublicProfile[] {
  const term = query.trim().replace(/^@/, '').toLowerCase();
  if (!term) {
    return people;
  }
  return people.filter((person) => {
    const name = (person.display_name ?? '').toLowerCase();
    const handle = (person.username ?? '').toLowerCase();
    return name.includes(term) || handle.includes(term);
  });
}

export function calloutAlertTitle(title: string | null | undefined, stored?: string | null): string {
  return calloutTitle(stored || title || '');
}

export async function fetchMyCallouts(): Promise<Callout[]> {
  const { data, error } = await supabase
    .from('callouts')
    .select(CALLOUT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(40);
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  return ((data ?? []) as Callout[]).map(asCallout);
}

export async function fetchCallout(id: string): Promise<Callout> {
  const { data, error } = await supabase
    .from('callouts')
    .select(CALLOUT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  if (!data) {
    throw new Error('Call-out not found');
  }
  return asCallout(data as Callout);
}

export async function fetchCalloutByChallengeId(challengeId: string): Promise<Callout | null> {
  const id = String(challengeId ?? '').trim();
  if (!id) {
    return null;
  }
  const { data, error } = await supabase
    .from('callouts')
    .select(CALLOUT_COLUMNS)
    .eq('challenge_id', id)
    .maybeSingle();
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  return data ? asCallout(data as Callout) : null;
}

export async function createCallout(input: {
  opponentId: string;
  amount: number;
  currency: WalletCurrency;
  winCondition: string;
  deadline: string;
  proofs?: ChallengeProof[];
  format?: CalloutFormat;
}): Promise<Callout> {
  const { data, error } = await supabase.rpc('create_callout', {
    p_opponent_id: input.opponentId,
    p_amount: input.amount,
    p_currency: input.currency,
    p_win_condition: calloutTitle(input.winCondition),
    p_deadline: input.deadline,
    p_proofs: proofsForStorage(calloutProofsForCreate(input.proofs)),
    p_format: calloutFormatOf(input.format),
  });
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  return asCalloutResult(data);
}

export async function acceptCallout(id: string): Promise<Callout> {
  const { data, error } = await supabase.rpc('accept_callout', { p_callout_id: id });
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  return asCalloutResult(data);
}

export async function declineCallout(id: string): Promise<Callout> {
  const { data, error } = await supabase.rpc('decline_callout', { p_callout_id: id });
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  return asCalloutResult(data);
}

export async function submitCalloutResult(id: string, winnerId: string): Promise<Callout> {
  const { data, error } = await supabase.rpc('submit_callout_result', {
    p_callout_id: id,
    p_winner_id: winnerId,
  });
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  return asCalloutResult(data);
}

export async function cancelCallout(id: string): Promise<Callout> {
  const { data, error } = await supabase.rpc('cancel_callout', { p_callout_id: id });
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  return asCalloutResult(data);
}

export async function fetchCalloutProfiles(ids: string[]): Promise<PublicProfile[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) {
    return [];
  }
  const { data, error } = await supabase
    .from('profiles')
    .select(PUBLIC_PROFILE_COLUMNS)
    .in('id', unique);
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  return (data ?? []) as PublicProfile[];
}

export async function findProfileByUsername(username: string): Promise<PublicProfile | null> {
  const handle = username.trim().replace(/^@/, '').toLowerCase();
  if (handle.length < 2) {
    return null;
  }
  const { data, error } = await supabase
    .from('profiles')
    .select(PUBLIC_PROFILE_COLUMNS)
    .eq('username', handle)
    .maybeSingle();
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  return (data as PublicProfile | null) ?? null;
}

export async function fetchCalloutOpponents(userId: string): Promise<PublicProfile[]> {
  const [friends, blocked, pending, mine] = await Promise.all([
    fetchFriends(userId),
    fetchBlockedPeerIds(userId),
    supabase
      .from('callouts')
      .select('challenger_id, opponent_id')
      .eq('status', 'pending'),
    supabase.from('challenge_participants').select('challenge_id, status').eq('user_id', userId),
  ]);

  if (pending.error) {
    throw new Error(getErrorMessage(pending.error));
  }
  if (mine.error) {
    throw new Error(getErrorMessage(mine.error));
  }

  const friendIds = friends
    .map((row) => otherFriendshipUserId(row, userId))
    .filter(Boolean);
  const pendingPairIds = (pending.data ?? []).flatMap((row) => {
    const other = row.challenger_id === userId ? row.opponent_id : row.challenger_id;
    return other ? [other] : [];
  });

  const myLiveIds = (mine.data ?? [])
    .filter((row) => isCalloutRosterSeat(row.status))
    .map((row) => row.challenge_id)
    .filter(Boolean);

  let rosterMates: string[] = [];
  if (myLiveIds.length > 0) {
    const live = await supabase.from('challenges').select('id, status').in('id', myLiveIds);
    if (live.error) {
      throw new Error(getErrorMessage(live.error));
    }
    const liveIds = (live.data ?? [])
      .filter((row) => isCalloutRosterLive(row.status))
      .map((row) => row.id);
    if (liveIds.length > 0) {
      const others = await supabase
        .from('challenge_participants')
        .select('user_id, status')
        .in('challenge_id', liveIds)
        .neq('user_id', userId);
      if (others.error) {
        throw new Error(getErrorMessage(others.error));
      }
      rosterMates = (others.data ?? [])
        .filter((row) => isCalloutRosterSeat(row.status))
        .map((row) => row.user_id);
    }
  }

  const ids = selectCalloutOpponentIds({
    me: userId,
    friends: friendIds,
    rosterMates,
    blocked,
    pendingPairIds,
  });
  const people = await fetchCalloutProfiles(ids);
  const order = new Map(ids.map((id, index) => [id, index]));
  return people.slice().sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

async function fetchCalloutInvitePool(userId: string): Promise<{
  friends: string[];
  rosterMates: string[];
  blocked: Set<string>;
}> {
  const [friends, blocked, mine] = await Promise.all([
    fetchFriends(userId),
    fetchBlockedPeerIds(userId),
    supabase.from('challenge_participants').select('challenge_id, status').eq('user_id', userId),
  ]);
  if (mine.error) {
    throw new Error(getErrorMessage(mine.error));
  }
  const friendIds = friends.map((row) => otherFriendshipUserId(row, userId)).filter(Boolean);
  const myLiveIds = (mine.data ?? [])
    .filter((row) => isCalloutRosterSeat(row.status))
    .map((row) => row.challenge_id)
    .filter(Boolean);
  let rosterMates: string[] = [];
  if (myLiveIds.length > 0) {
    const live = await supabase.from('challenges').select('id, status').in('id', myLiveIds);
    if (live.error) {
      throw new Error(getErrorMessage(live.error));
    }
    const liveIds = (live.data ?? [])
      .filter((row) => isCalloutRosterLive(row.status))
      .map((row) => row.id);
    if (liveIds.length > 0) {
      const others = await supabase
        .from('challenge_participants')
        .select('user_id, status')
        .in('challenge_id', liveIds)
        .neq('user_id', userId);
      if (others.error) {
        throw new Error(getErrorMessage(others.error));
      }
      rosterMates = (others.data ?? [])
        .filter((row) => isCalloutRosterSeat(row.status))
        .map((row) => row.user_id);
    }
  }
  return { friends: friendIds, rosterMates, blocked };
}

export async function fetchWatchedCalloutChallenges(userId: string): Promise<
  { id: string; title: string | null; task: string | null; status: string | null; is_callout: boolean }[]
> {
  const { data, error } = await supabase
    .from('callout_observers')
    .select('callout_id, callouts!inner(challenge_id, status, win_condition)')
    .eq('user_id', userId);
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  const challengeIds = [
    ...new Set(
      (data ?? [])
        .map((row) => {
          const nested = (
            row as {
              callouts?: { challenge_id?: string | null } | { challenge_id?: string | null }[] | null;
            }
          ).callouts;
          const callout = Array.isArray(nested) ? nested[0] : nested;
          return String(callout?.challenge_id ?? '').trim();
        })
        .filter(Boolean),
    ),
  ];
  if (challengeIds.length === 0) {
    return [];
  }
  const challenges = await supabase
    .from('challenges')
    .select('id, title, task, status, is_callout')
    .in('id', challengeIds);
  if (challenges.error) {
    throw new Error(getErrorMessage(challenges.error));
  }
  return (challenges.data ?? []).map((row) => ({
    id: String(row.id),
    title: row.title ?? null,
    task: row.task ?? null,
    status: row.status ?? null,
    is_callout: true,
  }));
}

export async function fetchCalloutObservers(calloutId: string): Promise<CalloutObserver[]> {
  const { data, error } = await supabase
    .from('callout_observers')
    .select('callout_id, user_id, invited_by, created_at')
    .eq('callout_id', calloutId)
    .order('created_at', { ascending: true });
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  return (data ?? []) as CalloutObserver[];
}

export async function fetchCalloutObserverCandidates(
  userId: string,
  callout: Pick<Callout, 'challenger_id' | 'opponent_id'>,
  alreadyWatching: string[],
): Promise<PublicProfile[]> {
  const pool = await fetchCalloutInvitePool(userId);
  const ids = selectCalloutObserverIds({
    me: userId,
    fighters: [callout.challenger_id, callout.opponent_id],
    friends: pool.friends,
    rosterMates: pool.rosterMates,
    blocked: pool.blocked,
    alreadyWatching,
  });
  const people = await fetchCalloutProfiles(ids);
  const order = new Map(ids.map((id, index) => [id, index]));
  return people.slice().sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

export async function inviteCalloutObserver(
  calloutId: string,
  userId: string,
): Promise<CalloutObserver> {
  const { data, error } = await supabase.rpc('invite_callout_observer', {
    p_callout_id: calloutId,
    p_user_id: userId,
  });
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('Couldn’t invite that watcher.');
  }
  return row as CalloutObserver;
}

export async function leaveCalloutWatch(calloutId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('callout_observers')
    .delete()
    .eq('callout_id', calloutId)
    .eq('user_id', userId);
  if (error) {
    throw new Error(getErrorMessage(error));
  }
}

export function calloutStatusLabel(status: Callout['status']): string {
  switch (status) {
    case 'pending':
      return 'Waiting to accept';
    case 'active':
      return 'Stakes held';
    case 'resolving':
      return 'Waiting on both picks';
    case 'settled':
      return 'Settled';
    case 'disputed':
      return 'Disputed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}
