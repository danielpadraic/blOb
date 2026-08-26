import {
  captureTypeForMethod,
  parseProofParts,
  uniqueProofUrls,
  type ChallengeProof,
  type ChallengeProofPart,
} from '../challengeProofs';
import type { CheckinHealthProof } from '../health/checkinHealthProof';
import { asCheckinStatus, type ChallengeCheckin } from '../challengeCheckin';
import { normalizePeriodKey } from '../checkinPeriod';
import { mapCheckinRpcError } from './errors';

export type CheckinRpcClient = {
  auth: {
    getUser: () => PromiseLike<{ data: { user: { id: string } | null } }>;
  };
  rpc: (fn: string, args?: Record<string, unknown>) => unknown;
};

export type UploadCheckinProofFn = (input: {
  uri: string;
  userId: string;
  challengeId: string;
  proofType: string;
  mimeType?: string | null;
  blob?: Blob | null;
}) => Promise<string>;

export type ResolveProofUrlFn = (path: string) => Promise<string>;

export type SaveCheckinProofInput = {
  challengeId: string;
  proof?: ChallengeProof;
  uri?: string | null;
  mimeType?: string | null;
  text?: string | null;
  fromLibrary?: boolean;
  blob?: Blob | null;
  notes?: string | null;
  extraMedia?: string[] | null;
  urls?: string[] | null;
  clearProof?: boolean;
  health?: CheckinHealthProof | null;
};

function isRemoteMediaUrl(uri: string): boolean {
  return /^https?:\/\//i.test(uri);
}

export function parseChallengeCheckin(row: Record<string, unknown>): ChallengeCheckin {
  const submittedAt = (row.submitted_at as string | null) ?? null;
  const parsed = asCheckinStatus(row.status);
  const status = submittedAt ? 'submitted' : (parsed ?? 'in_progress');
  const fallbackDate = new Date().toISOString().slice(0, 10);
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    challenge_id: String(row.challenge_id),
    period_key: normalizePeriodKey(row.period_key ?? row.submission_date ?? fallbackDate),
    status,
    proof_parts: parseProofParts(row.proof_parts),
    pre_selfie_url: (row.pre_selfie_url as string | null) ?? null,
    post_selfie_url: (row.post_selfie_url as string | null) ?? null,
    hr_monitor_url: (row.hr_monitor_url as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    health_workout_id: (row.health_workout_id as string | null) ?? null,
    workout_submission_id: (row.workout_submission_id as string | null) ?? null,
    started_at: String(row.started_at ?? row.created_at ?? new Date().toISOString()),
    submitted_at: submittedAt,
    scoring_version:
      row.scoring_version == null || !Number.isFinite(Number(row.scoring_version))
        ? null
        : Math.round(Number(row.scoring_version)),
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: (row.updated_at as string | null) ?? null,
  };
}

async function currentUserId(client: CheckinRpcClient): Promise<string> {
  const { data } = await client.auth.getUser();
  const userId = data.user?.id;
  if (!userId) {
    throw new Error('You need to be signed in.');
  }
  return userId;
}

async function proofPartFor(
  input: SaveCheckinProofInput,
  userId: string,
  upload: UploadCheckinProofFn,
  resolveUrl: ResolveProofUrlFn,
): Promise<{ id: string; part: ChallengeProofPart; healthWorkoutId: string | null } | null> {
  if (input.clearProof) {
    return input.proof ? { id: input.proof.id, part: { method: input.proof.method }, healthWorkoutId: null } : null;
  }
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
      part: { method: proof.method, url: '', healthWorkoutId, health: input.health ?? null },
      healthWorkoutId,
    };
  }
  if (!uri && !input.blob) {
    throw new Error('Add that proof to continue.');
  }
  const url = isRemoteMediaUrl(uri)
    ? uri
    : await resolveUrl(
        await upload({
          uri: uri || 'blob:proof',
          userId,
          challengeId: input.challengeId,
          proofType: captureTypeForMethod(proof.method),
          mimeType: input.mimeType,
          blob: input.blob,
        }),
      );
  const urls = uniqueProofUrls([url, ...(input.urls ?? [])]);
  return {
    id: proof.id,
    part: {
      method: proof.method,
      url: urls[0] ?? url,
      urls,
      fromLibrary: input.fromLibrary === true,
    },
    healthWorkoutId: null,
  };
}

export async function saveCheckinProofWithClient(
  client: CheckinRpcClient,
  input: SaveCheckinProofInput,
  upload: UploadCheckinProofFn,
  resolveUrl: ResolveProofUrlFn,
): Promise<ChallengeCheckin> {
  const userId = await currentUserId(client);
  const packed = await proofPartFor(input, userId, upload, resolveUrl);
  const { data, error } = (await client.rpc('save_checkin_proof', {
    p_challenge_id: input.challengeId,
    p_proof_id: input.clearProof ? input.proof?.id ?? packed?.id ?? null : packed?.id ?? null,
    p_proof_part: input.clearProof ? null : packed?.part ?? null,
    p_health_workout_id: input.clearProof ? null : packed?.healthWorkoutId ?? null,
    p_notes: input.notes ?? null,
    p_extra_media: input.extraMedia ?? null,
    p_clear_proof: input.clearProof === true,
  })) as { data: unknown; error: { message?: string; code?: string; details?: string } | null };
  if (error) {
    throw new Error(mapCheckinRpcError(error, 'save'));
  }
  return parseChallengeCheckin((data ?? {}) as Record<string, unknown>);
}

export async function submitCheckinWithClient(
  client: CheckinRpcClient,
  challengeId: string,
): Promise<ChallengeCheckin | null> {
  const { data, error } = (await client.rpc('submit_checkin', {
    p_challenge_id: challengeId,
  })) as { data: unknown; error: { message?: string; code?: string; details?: string } | null };
  if (error) {
    throw new Error(mapCheckinRpcError(error, 'submit'));
  }
  const row = data as Record<string, unknown> | null;
  const nested = row?.checkin;
  if (nested && typeof nested === 'object') {
    return parseChallengeCheckin(nested as Record<string, unknown>);
  }
  return null;
}
