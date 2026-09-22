import {
  captureTypeForMethod,
  parseProofParts,
  uniqueProofUrls,
  type ChallengeProof,
  type ChallengeProofPart,
} from '../challengeProofs';
import { parseSessionDistanceText } from '../distance';
import type { CheckinHealthProof } from '../health/checkinHealthProof';
import { asCheckinStatus, type ChallengeCheckin } from '../challengeCheckin';
import { parseMetricValues } from '../comparablePoints';
import { normalizePeriodKey } from '../checkinPeriod';
import { clampProofCaption } from '../checkinShare';
import { isVendorHealthSlot } from '../health/ocrBackfill';
import { isRecapCardUrl } from '../health/postWorkoutCard';
import { proofPartMediaUrls } from './unionAttachments';
import { hashCheckinProof } from './hashProof';
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
  /**
   * Set when the uploaded still IS the workout proof (the generated blOb workout card), so the slot
   * keeps its Health provenance alongside a real image URL.
   */
  healthWorkoutId?: string | null;
  caption?: string | null;
  /**
   * Stamps the renderer generation on the slot when the uploaded image is a generated workout card.
   * Left unset for camera stills, which no renderer owns.
   */
  cardVersion?: number | null;
  /** Host / moderator proxy: the participant this proof belongs to. */
  forUserId?: string | null;
};

function partWithCaption(part: ChallengeProofPart, caption?: string | null): ChallengeProofPart {
  const text = clampProofCaption((caption ?? '').trim());
  return { ...part, caption: text || null };
}

function isRemoteMediaUrl(uri: string): boolean {
  return /^https?:\/\//i.test(uri);
}

async function resolveProofStillUrls(
  input: SaveCheckinProofInput,
  userId: string,
  upload: UploadCheckinProofFn,
  resolveUrl: ResolveProofUrlFn,
  proofType: string,
): Promise<string[]> {
  const stills = uniqueProofUrls([input.uri, ...(input.urls ?? [])]).filter(
    (url) => url && !url.startsWith('health:'),
  );
  const out: string[] = [];
  for (let i = 0; i < stills.length; i += 1) {
    const uri = stills[i];
    if (isRemoteMediaUrl(uri)) {
      out.push(uri);
      continue;
    }
    out.push(
      await resolveUrl(
        await upload({
          uri,
          userId,
          challengeId: input.challengeId,
          proofType,
          mimeType: input.mimeType,
          blob: i === 0 ? input.blob ?? undefined : undefined,
        }),
      ),
    );
  }
  return uniqueProofUrls(out);
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
    metric_values: parseMetricValues(row.metric_values),
    health_workout_id: (row.health_workout_id as string | null) ?? null,
    workout_submission_id: (row.workout_submission_id as string | null) ?? null,
    started_at: String(row.started_at ?? row.created_at ?? new Date().toISOString()),
    submitted_at: submittedAt,
    scoring_version:
      row.scoring_version == null || !Number.isFinite(Number(row.scoring_version))
        ? null
        : Math.round(Number(row.scoring_version)),
    distance_meters:
      row.distance_meters == null || !Number.isFinite(Number(row.distance_meters))
        ? null
        : Math.round(Number(row.distance_meters)),
    route_preview_url: (row.route_preview_url as string | null) ?? null,
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: (row.updated_at as string | null) ?? null,
    logged_by: (row.logged_by as string | null) ?? null,
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
    return { id: proof.id, part: partWithCaption({ method: 'honor' }, input.caption), healthWorkoutId: null };
  }
  if (proof.method === 'checkin') {
    return {
      id: proof.id,
      part: partWithCaption({ method: 'checkin', text: (input.text ?? '').trim() || null }, input.caption),
      healthWorkoutId: null,
    };
  }
  if (proof.method === 'distance') {
    const uri = input.uri?.trim() ?? '';
    const healthWorkoutId = uri.startsWith('health:')
      ? uri.slice('health:'.length)
      : input.healthWorkoutId?.trim() || null;
    const uploaded = await resolveProofStillUrls(
      input,
      userId,
      upload,
      resolveUrl,
      input.cardVersion != null ? 'workout_card' : captureTypeForMethod(proof.method),
    );
    const media = proofPartMediaUrls({
      uploaded,
      recap: uploaded.find((url) => isRecapCardUrl(url, null)) ?? null,
    });
    const url = media[0] ?? '';
    const meters = input.health?.distanceMeters ?? parseSessionDistanceText(input.text);
    const contentHash = await hashCheckinProof({
      uri: uploaded[0] ?? uri,
      blob: input.blob,
      url,
      healthWorkoutId,
    });
    return {
      id: proof.id,
      part: partWithCaption(
        {
          method: 'distance',
          text: (input.text ?? '').trim() || null,
          url,
          urls: media,
          healthWorkoutId,
          health: input.health ?? null,
          distanceMeters: meters,
          contentHash: contentHash || null,
        },
        input.caption,
      ),
      healthWorkoutId,
    };
  }
  const uri = input.uri?.trim() ?? '';
  const healthFromUri = uri.startsWith('health:') ? uri.slice('health:'.length) : '';
  const healthWorkoutId = input.healthWorkoutId?.trim() || healthFromUri || null;
  const hasStills = proofInputHasFile(input);
  if (healthFromUri && !hasStills) {
    const contentHash = await hashCheckinProof({ healthWorkoutId });
    return {
      id: proof.id,
      part: partWithCaption(
        {
          method: proof.method,
          url: '',
          urls: [],
          healthWorkoutId,
          health: input.health ?? null,
          contentHash: contentHash || null,
        },
        input.caption,
      ),
      healthWorkoutId,
    };
  }
  if (!uri && !input.blob && !(input.urls && input.urls.length > 0)) {
    throw new Error('Add that proof to continue.');
  }
  const uploaded = await resolveProofStillUrls(
    input,
    userId,
    upload,
    resolveUrl,
    input.cardVersion != null ? 'workout_card' : captureTypeForMethod(proof.method),
  );
  const vendor = isVendorHealthSlot({
    health: input.health,
    healthWorkoutId,
  });
  const recap = uploaded.find((url) => isRecapCardUrl(url, null)) ?? (input.cardVersion != null ? uploaded[uploaded.length - 1] : null);
  const media = vendor ? proofPartMediaUrls({ uploaded, recap }) : uploaded;
  const url = media[0] ?? '';
  if (!url && !healthWorkoutId) {
    throw new Error('Add that proof to continue.');
  }
  const contentHash = await hashCheckinProof({
    uri: uploaded[0] ?? uri,
    blob: input.blob,
    url,
    healthWorkoutId,
  });
  return {
    id: proof.id,
    part: partWithCaption(
      {
        method: proof.method,
        url,
        urls: media,
        fromLibrary: input.fromLibrary === true,
        ...(healthWorkoutId ? { healthWorkoutId } : null),
        ...(input.health ? { health: input.health } : null),
        contentHash: contentHash || null,
      },
      input.caption,
    ),
    healthWorkoutId,
  };
}

function proofInputHasFile(input: SaveCheckinProofInput): boolean {
  const uri = input.uri?.trim() ?? '';
  if (uri && !uri.startsWith('health:')) {
    return true;
  }
  if (input.blob) {
    return true;
  }
  return Boolean(input.urls?.some((url) => Boolean(url?.trim()) && !url.startsWith('health:')));
}

export async function saveCheckinProofWithClient(
  client: CheckinRpcClient,
  input: SaveCheckinProofInput,
  upload: UploadCheckinProofFn,
  resolveUrl: ResolveProofUrlFn,
): Promise<ChallengeCheckin> {
  const userId = await currentUserId(client);
  // A required slot that still has a file is never emptied by p_clear_proof.
  const clearProof = input.clearProof === true && !proofInputHasFile(input);
  const packed = await proofPartFor({ ...input, clearProof }, userId, upload, resolveUrl);
  // The RPC replaces the whole slot object with what it is handed, so the stamp has to travel with
  // the part rather than being written separately afterwards.
  const part =
    packed && input.cardVersion != null
      ? { ...packed.part, cardVersion: input.cardVersion }
      : packed?.part ?? null;
  const { data, error } = (await client.rpc('save_checkin_proof', {
    p_challenge_id: input.challengeId,
    p_proof_id: clearProof ? input.proof?.id ?? packed?.id ?? null : packed?.id ?? null,
    p_proof_part: clearProof ? null : part,
    p_health_workout_id: clearProof ? null : packed?.healthWorkoutId ?? null,
    p_notes: input.notes ?? null,
    p_extra_media: input.extraMedia ?? null,
    p_clear_proof: clearProof,
    p_for_user_id: input.forUserId?.trim() || null,
  })) as { data: unknown; error: { message?: string; code?: string; details?: string } | null };
  if (error) {
    throw new Error(mapCheckinRpcError(error, 'save'));
  }
  return parseChallengeCheckin((data ?? {}) as Record<string, unknown>);
}

export async function saveCheckinMetricValuesWithClient(
  client: CheckinRpcClient,
  challengeId: string,
  values: Record<string, number>,
  extras?: { notes?: string | null; logChoices?: Record<string, string> | null },
): Promise<void> {
  const payload = {
    p_challenge_id: challengeId,
    p_metric_values: values,
    p_notes: extras?.notes ?? null,
    p_log_choices: extras?.logChoices ?? null,
  };
  let result = (await client.rpc('save_checkin_metric_values', payload)) as {
    error: { message?: string } | null;
  };
  const message = result.error?.message ?? '';
  if (
    result.error &&
    (message.includes('p_notes') ||
      message.includes('p_log_choices') ||
      message.includes('schema cache') ||
      message.includes('does not exist'))
  ) {
    result = (await client.rpc('save_checkin_metric_values', {
      p_challenge_id: challengeId,
      p_metric_values: values,
    })) as { error: { message?: string } | null };
  }
  if (result.error) {
    throw new Error(mapCheckinRpcError(result.error, 'save'));
  }
}

export async function submitCheckinWithClient(
  client: CheckinRpcClient,
  challengeId: string,
  forUserId?: string | null,
): Promise<ChallengeCheckin | null> {
  const { data, error } = (await client.rpc('submit_checkin', {
    p_challenge_id: challengeId,
    p_for_user_id: forUserId?.trim() || null,
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
