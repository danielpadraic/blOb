import { copy } from '@/lib/copy';
import { supabase } from '@/lib/supabase';
import type {
  CloseChallengeForJudgingResult,
  DistributeChallengeResult,
  EliminateParticipantResult,
  JoinChallengeResult,
  MarkChallengeStartedResult,
  PublishChallengePayload,
  PublishChallengeResult,
  RefundPreStartResult,
} from '@/lib/types/challenge';

const RPC_MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: 'Sign in to continue.',
  NOT_CREATOR: 'Only the host can close or pay out.',
  TOO_EARLY_DISTRIBUTE: 'Payout unlocks 1 hour after the challenge ends.',
  CHALLENGE_NOT_ENDED: 'This challenge hasn’t ended yet.',
  NO_END_DATE: 'This challenge doesn’t have an end date.',
  ALREADY_SETTLED: 'Already paid out.',
  ALREADY_DISTRIBUTED: 'Already paid out.',
  TITLE_REQUIRED: 'Give the challenge a title before you publish.',
  INVALID_CURRENCY: 'Pick Blob Coins or Blob Bucks.',
  MAX_PARTICIPANTS_MIN_1: 'Max competitors must be at least 1.',
  LMS_REQUIRES_CONSISTENCY: 'Last Man Standing only works with a consistency challenge.',
  FULL_LOBBY_REQUIRES_MAX: 'A full-lobby start needs a max number of competitors.',
  PROFILE_NOT_FOUND: 'Finish setting up your profile first.',
  NEGATIVE_AMOUNT: 'Amounts can’t be negative.',
  LANE_REQUIRED: 'Choose Coin Challenge or Private Challenge.',
  OFFICIAL_NOT_ALLOWED: 'Official competitions are hosted by blOb.',
  PRIVATE_NO_PLAYER_BUY_IN: 'Private challenges can’t charge competitors a buy-in for the prize. You fund the prize.',
  INSUFFICIENT_FUNDS: 'Not enough Coins/Bucks to fund this prize.',
  CHALLENGE_NOT_FOUND: 'Challenge not found.',
  ALREADY_STARTED: 'This challenge already started.',
  NOT_JOINABLE: 'This challenge is not accepting competitors.',
  BODY_METRICS_REQUIRED: 'Add body metrics first to join Official Fitness Challenges.',
  ALREADY_JOINED: 'You already joined this challenge.',
  LOBBY_FULL: 'This challenge is full.',
  NOT_INVITED: 'This challenge is private. Ask the host for an invite.',
  JOIN_CLOSED: 'Join closed when this challenge started.',
  FRIENDS_ONLY: 'This challenge is for friends of the host.',
  GEO_BLOCKED: copy('geo.unavailable'),
  POST_NOT_FOUND: 'That post is gone.',
  NOT_A_CHALLENGE_PROOF: 'Only challenge proofs can be flagged.',
  CANNOT_FLAG_OWN: 'You can’t flag your own proof.',
  ONLY_HOST_CAN_INVITE: 'Only the host can invite people.',
  INVITE_NOT_FOUND: 'That invite link is not valid.',
  INVITE_USED: 'That invite was already used.',
  INVITE_REVOKED: 'That invite is no longer valid.',
  NO_REFUND_AFTER_START: 'Refunds are not allowed after the official start.',
  FORBIDDEN: 'You can’t do that.',
  NOT_A_PARTICIPANT: 'That person is not in this challenge.',
  NOT_STARTED: 'This challenge hasn’t started yet.',
  LMS_NOT_FINISHED: 'Last Man Standing is not down to one person yet.',
  NO_END_TIME: 'This challenge doesn’t have an end date.',
  COOLDOWN_ACTIVE: 'Payout unlocks 1 hour after the challenge ends.',
  OPEN_DISPUTES: 'Payouts wait until open disputes are resolved.',
  NO_WINNER: 'There is no winner to pay.',
  NO_COMPLETERS: 'Nobody completed this challenge.',
};

function rpcMessage(error: unknown): string {
  const raw =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');
  const trimmed = raw.trim();
  if (RPC_MESSAGES[trimmed]) {
    return RPC_MESSAGES[trimmed];
  }
  const upper = trimmed.toUpperCase();
  for (const [key, label] of Object.entries(RPC_MESSAGES)) {
    if (upper.includes(key)) {
      return label;
    }
  }
  return trimmed || 'Something went sideways. Try again in a moment.';
}

function unwrap<T>(data: unknown, error: unknown): T {
  if (error) {
    throw new Error(rpcMessage(error));
  }
  return data as T;
}

function asJson(payload: PublishChallengePayload): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) {
      continue;
    }
    row[key] = value;
  }
  return row;
}

export async function publishChallenge(
  payload: PublishChallengePayload,
  draftId?: string | null,
): Promise<PublishChallengeResult> {
  const json = asJson(payload);
  if (draftId) {
    const withDraft = await supabase.rpc('publish_challenge', {
      p_payload: json,
      p_draft_id: draftId,
    });
    if (!withDraft.error) {
      return unwrap<PublishChallengeResult>(withDraft.data, withDraft.error);
    }
    const message = String(withDraft.error.message ?? '');
    if (!isMissingRpc(message) && !message.toLowerCase().includes('p_draft_id')) {
      throw new Error(rpcMessage(withDraft.error));
    }
  }
  const { data, error } = await supabase.rpc('publish_challenge', { p_payload: json });
  return unwrap<PublishChallengeResult>(data, error);
}

export async function joinChallenge(id: string): Promise<JoinChallengeResult> {
  const { data, error } = await supabase.rpc('join_challenge', { p_challenge_id: id });
  return unwrap<JoinChallengeResult>(data, error);
}

export async function refundPreStart(challengeId: string, userId?: string): Promise<RefundPreStartResult> {
  const { data, error } = userId
    ? await supabase.rpc('refund_pre_start', { p_challenge_id: challengeId, p_user_id: userId })
    : await supabase.rpc('refund_pre_start', { p_challenge_id: challengeId });
  return unwrap<RefundPreStartResult>(data, error);
}

export async function markChallengeStarted(id: string): Promise<MarkChallengeStartedResult> {
  const { data, error } = await supabase.rpc('mark_challenge_started', { p_challenge_id: id });
  return unwrap<MarkChallengeStartedResult>(data, error);
}

export async function eliminateParticipant(
  challengeId: string,
  userId: string,
): Promise<EliminateParticipantResult> {
  const { data, error } = await supabase.rpc('eliminate_participant', {
    p_challenge_id: challengeId,
    p_user_id: userId,
  });
  return unwrap<EliminateParticipantResult>(data, error);
}

function isMissingRpc(message: string) {
  const text = message.toLowerCase();
  return (
    text.includes('does not exist') ||
    text.includes('could not find') ||
    text.includes('404') ||
    text.includes('schema cache')
  );
}

function asCloseResult(
  id: string,
  data: unknown,
  fallbackStartedAt?: string | null,
): CloseChallengeForJudgingResult {
  const row =
    data && typeof data === 'object'
      ? (data as CloseChallengeForJudgingResult & { id?: string })
      : {};
  const judgingStartedAt = row.judging_started_at ?? fallbackStartedAt ?? new Date().toISOString();
  return {
    ok: true,
    challenge_id: row.challenge_id ?? row.id ?? id,
    status: row.status ?? 'judging',
    judging_started_at: judgingStartedAt,
    distributable_at:
      row.distributable_at ??
      new Date(Date.parse(judgingStartedAt) + 60 * 60 * 1000).toISOString(),
  };
}

export async function closeChallengeForJudging(
  id: string,
): Promise<CloseChallengeForJudgingResult> {
  const ensure = await supabase.rpc('ensure_challenge_judging', { p_challenge_id: id });
  if (!ensure.error) {
    return asCloseResult(id, ensure.data);
  }
  if (!isMissingRpc(String(ensure.error.message ?? ''))) {
    throw new Error(rpcMessage(ensure.error));
  }

  const close = await supabase.rpc('close_challenge_for_judging', { p_challenge_id: id });
  if (!close.error) {
    return asCloseResult(id, close.data);
  }
  if (!isMissingRpc(String(close.error.message ?? ''))) {
    throw new Error(rpcMessage(close.error));
  }

  const fallback = await supabase.rpc('mark_challenge_judging', { p_challenge_id: id });
  unwrap<unknown>(fallback.data, fallback.error);
  return asCloseResult(id, fallback.data);
}

export async function distributeChallenge(id: string): Promise<DistributeChallengeResult> {
  const { data, error } = await supabase.rpc('distribute_challenge', { p_challenge_id: id });
  return unwrap<DistributeChallengeResult>(data, error);
}
