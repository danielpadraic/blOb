import {
  captureTypeForMethod,
  parseProofParts,
  type ChallengeProof,
  type ChallengeProofPart,
} from '@/lib/challengeProofs';
import { asCheckinStatus, type ChallengeCheckin } from '@/lib/challengeCheckin';
import { supabase } from '@/lib/supabase';
import { utcDateStamp } from '@/utils/dates';
import { getCheckinSubmitMessage, getErrorMessage, logPostgrestError } from '@/utils/errors';
import { reportAppError } from '@/lib/appErrors';
import { challengeProofUrl, uploadChallengeProof } from '@/utils/upload';

export type SaveCheckinProofInput = {
  challengeId: string;
  proof?: ChallengeProof;
  uri?: string | null;
  mimeType?: string | null;
  text?: string | null;
};

function throwMapped(
  error: { message?: string; code?: string; details?: string },
  kind: 'save' | 'submit',
): never {
  logPostgrestError(kind === 'submit' ? 'checkin-submit' : 'checkin-save', error);
  if (kind === 'submit') {
    reportAppError({ route: 'submit_checkin', error });
    throw new Error(getCheckinSubmitMessage(error));
  }
  const blob = [error.code, error.message, error.details].filter(Boolean).join(' ');
  const upper = blob.toUpperCase();
  if (upper.includes('ALREADY_LOGGED_TODAY') || upper.includes('ALREADY CHECKED IN')) {
    throw new Error('Already checked in today. Come back tomorrow.');
  }
  if (upper.includes('MISSING_PROOFS')) {
    throw new Error('Add every required proof to submit.');
  }
  if (upper.includes('NOT_PARTICIPANT') || upper.includes('JOIN THIS CHALLENGE')) {
    throw new Error('Join this challenge before you check in.');
  }
  if (upper.includes('NOT_STARTED')) {
    throw new Error('This challenge hasn’t started yet.');
  }
  if (upper.includes('BEGIN CHECK-IN FIRST')) {
    throw new Error('Begin check-in first.');
  }
  if (
    upper.includes('42804') ||
    upper.includes('22P02') ||
    upper.includes('PGRST') ||
    (upper.includes('TASK_IDS') && upper.includes('JSONB'))
  ) {
    throw new Error('Couldn’t save that proof. Try again.');
  }
  throw new Error(getErrorMessage(error));
}

export function parseChallengeCheckin(row: Record<string, unknown>): ChallengeCheckin {
  const status = asCheckinStatus(row.status) ?? 'in_progress';
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    challenge_id: String(row.challenge_id),
    period_key: String(row.period_key ?? row.submission_date ?? utcDateStamp()),
    status,
    proof_parts: parseProofParts(row.proof_parts),
    pre_selfie_url: (row.pre_selfie_url as string | null) ?? null,
    post_selfie_url: (row.post_selfie_url as string | null) ?? null,
    hr_monitor_url: (row.hr_monitor_url as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    health_workout_id: (row.health_workout_id as string | null) ?? null,
    workout_submission_id: (row.workout_submission_id as string | null) ?? null,
    started_at: String(row.started_at ?? row.created_at ?? new Date().toISOString()),
    submitted_at: (row.submitted_at as string | null) ?? null,
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: (row.updated_at as string | null) ?? null,
  };
}

async function currentUserId(): Promise<string> {
  const { data: session } = await supabase.auth.getUser();
  const userId = session.user?.id;
  if (!userId) {
    throw new Error('You need to be signed in.');
  }
  return userId;
}

async function proofPartFor(
  input: SaveCheckinProofInput,
  userId: string,
): Promise<{ id: string; part: ChallengeProofPart; healthWorkoutId: string | null } | null> {
  const proof = input.proof;
  if (!proof) {
    return null;
  }
  if (proof.method === 'honor') {
    return { id: proof.id, part: { method: 'honor' }, healthWorkoutId: null };
  }
  if (proof.method === 'checkin') {
    return {
      id: proof.id,
      part: { method: 'checkin', text: (input.text ?? input.uri ?? '').trim() || null },
      healthWorkoutId: null,
    };
  }
  const uri = input.uri?.trim() ?? '';
  if (uri.startsWith('health:')) {
    const healthWorkoutId = uri.slice('health:'.length);
    return {
      id: proof.id,
      part: { method: proof.method, url: '', healthWorkoutId },
      healthWorkoutId,
    };
  }
  if (!uri) {
    throw new Error('Add that proof to continue.');
  }
  const url = await challengeProofUrl(
    await uploadChallengeProof({
      uri,
      userId,
      challengeId: input.challengeId,
      proofType: captureTypeForMethod(proof.method),
      mimeType: input.mimeType,
    }),
  );
  return { id: proof.id, part: { method: proof.method, url }, healthWorkoutId: null };
}

export async function saveCheckinProof(input: SaveCheckinProofInput): Promise<ChallengeCheckin> {
  const userId = await currentUserId();
  const packed = await proofPartFor(input, userId);
  const { data, error } = await supabase.rpc('save_checkin_proof', {
    p_challenge_id: input.challengeId,
    p_proof_id: packed?.id ?? null,
    p_proof_part: packed?.part ?? null,
    p_health_workout_id: packed?.healthWorkoutId ?? null,
  });
  if (error) {
    throwMapped(error, 'save');
  }
  return parseChallengeCheckin((data ?? {}) as Record<string, unknown>);
}

export async function submitCheckin(challengeId: string): Promise<ChallengeCheckin | null> {
  const { data, error } = await supabase.rpc('submit_checkin', {
    p_challenge_id: challengeId,
  });
  if (error) {
    throwMapped(error, 'submit');
  }
  const row = data as Record<string, unknown> | null;
  const nested = row?.checkin;
  if (nested && typeof nested === 'object') {
    return parseChallengeCheckin(nested as Record<string, unknown>);
  }
  return null;
}
