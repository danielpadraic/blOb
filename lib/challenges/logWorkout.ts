import { requestPushAfterValue } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import {
  captureTypeForMethod,
  type ChallengeProof,
  type ChallengeProofPart,
} from '@/lib/challengeProofs';
import type { ProofType, WorkoutSubmission } from '@/lib/types';
import { utcDateStamp } from '@/utils/dates';
import { getErrorMessage } from '@/utils/errors';
import { challengeProofUrl, uploadChallengeProof } from '@/utils/upload';

export type LogWorkoutProof = {
  type: ProofType;
  uri: string;
  mimeType?: string | null;
  proofId?: string;
  text?: string | null;
};

export type LogWorkoutInput = {
  challengeId: string;
  proofs: LogWorkoutProof[];
  required?: ChallengeProof[];
  notes?: string | null;
};

export type LogWorkoutResult = WorkoutSubmission & {
  days_completed: number;
  media_urls: string[];
};

function throwMapped(error: { message?: string; code?: string; details?: string }): never {
  const blob = [error.code, error.message, error.details].filter(Boolean).join(' ');
  const upper = blob.toUpperCase();
  if (upper.includes('ALREADY_LOGGED_TODAY')) {
    throw new Error('Already checked in today. Come back tomorrow.');
  }
  if (upper.includes('MISSING_PROOFS')) {
    throw new Error('Add every required proof to check in today.');
  }
  if (upper.includes('NOT_PARTICIPANT')) {
    throw new Error('Join this challenge before you check in.');
  }
  if (upper.includes('NOT_STARTED')) {
    throw new Error('This challenge hasn’t started yet.');
  }
  if (
    upper.includes('42804') ||
    upper.includes('22P02') ||
    upper.includes('PGRST') ||
    (upper.includes('TASK_IDS') && upper.includes('JSONB'))
  ) {
    throw new Error('Couldn’t submit this check-in. Try again.');
  }
  throw new Error(getErrorMessage(error));
}

async function readDaysCompleted(challengeId: string, userId: string): Promise<number> {
  const { data } = await supabase
    .from('challenge_participants')
    .select('days_completed')
    .eq('challenge_id', challengeId)
    .eq('user_id', userId)
    .maybeSingle();
  return Number((data as { days_completed?: number } | null)?.days_completed ?? 0);
}

function asResult(
  row: Record<string, unknown>,
  mediaUrls: string[],
  daysCompleted: number,
  parts: Record<string, ChallengeProofPart>,
): LogWorkoutResult {
  return {
    id: String(row.id ?? ''),
    challenge_id: String(row.challenge_id ?? ''),
    user_id: String(row.user_id ?? ''),
    submission_date: String(row.submission_date ?? ''),
    pre_selfie_url: (row.pre_selfie_url as string | null) ?? mediaUrls[0] ?? null,
    post_selfie_url: (row.post_selfie_url as string | null) ?? mediaUrls[1] ?? null,
    hr_monitor_url: (row.hr_monitor_url as string | null) ?? mediaUrls[2] ?? null,
    notes: (row.notes as string | null) ?? null,
    status: (row.status as WorkoutSubmission['status']) ?? 'pending_review',
    task_ids: Array.isArray(row.task_ids) ? row.task_ids.map(String) : [],
    proof_parts: (row.proof_parts as Record<string, ChallengeProofPart> | null) ?? parts,
    proof_kind: (row.proof_kind as WorkoutSubmission['proof_kind']) ?? null,
    health_workout_id: (row.health_workout_id as string | null) ?? null,
    created_at: String(row.created_at ?? new Date().toISOString()),
    days_completed: daysCompleted,
    media_urls: mediaUrls,
  };
}

function assignLegacySlots(
  required: ChallengeProof[],
  parts: Record<string, ChallengeProofPart>,
): { pre: string; post: string; hr: string; notes: string | null } {
  let pre = '';
  let post = '';
  let hr = '';
  const notes: string[] = [];
  const extras: string[] = [];

  for (const proof of required) {
    const part = parts[proof.id];
    if (proof.method === 'checkin' && part?.text?.trim()) {
      notes.push(part.text.trim());
    }
    const url = part?.url?.trim() ?? '';
    if (!url) {
      continue;
    }
    if (proof.method === 'hr' && !hr) {
      hr = url;
      continue;
    }
    const named = proof.name.trim().toLowerCase();
    if (named.includes('pre') && !pre) {
      pre = url;
      continue;
    }
    if (named.includes('post') && !post) {
      post = url;
      continue;
    }
    extras.push(url);
  }

  const take = (): string => extras.shift() ?? '';
  return {
    pre: pre || take(),
    post: post || take(),
    hr: hr || take(),
    notes: notes.join('\n') || null,
  };
}

export async function logWorkout(input: LogWorkoutInput): Promise<LogWorkoutResult> {
  const { data: session } = await supabase.auth.getUser();
  const userId = session.user?.id;
  if (!userId) {
    throw new Error('You need to be signed in.');
  }

  const required = input.required ?? [];
  const mediaProofs = input.proofs.filter(
    (item) =>
      item.uri.trim() &&
      !item.uri.startsWith('health:') &&
      item.type !== 'text_note' &&
      item.type !== 'link',
  );
  const healthWorkoutId =
    input.proofs
      .map((item) => (item.uri.startsWith('health:') ? item.uri.slice('health:'.length) : ''))
      .find((id) => id.trim()) ?? null;
  const textBits = input.proofs
    .filter((item) => (item.type === 'text_note' || item.type === 'link' || item.text) && (item.text ?? item.uri).trim())
    .map((item) => (item.text ?? item.uri).trim());

  if (required.length === 0 && mediaProofs.length === 0 && textBits.length === 0 && !input.notes?.trim()) {
    throw new Error('Add every required proof to check in today.');
  }

  const uploaded = await Promise.all(
    mediaProofs.map(async (item) => ({
      proofId: item.proofId,
      type: item.type,
      url: await challengeProofUrl(
        await uploadChallengeProof({
          uri: item.uri,
          userId,
          challengeId: input.challengeId,
          proofType: item.type,
          mimeType: item.mimeType,
        }),
      ),
    })),
  );

  const parts: Record<string, ChallengeProofPart> = {};
  if (required.length > 0) {
    for (const proof of required) {
      if (proof.method === 'honor') {
        parts[proof.id] = { method: 'honor' };
        continue;
      }
      if (proof.method === 'checkin') {
        const row = input.proofs.find((item) => item.proofId === proof.id);
        parts[proof.id] = {
          method: 'checkin',
          text: (row?.text ?? row?.uri ?? '').trim() || null,
        };
        continue;
      }
      const uploadedRow = uploaded.find((item) => item.proofId === proof.id);
      const healthId = (input.proofs.find((item) => item.proofId === proof.id)?.uri ?? '').startsWith(
        'health:',
      )
        ? input.proofs.find((item) => item.proofId === proof.id)!.uri.slice('health:'.length)
        : null;
      parts[proof.id] = {
        method: proof.method,
        url: uploadedRow?.url ?? null,
        healthWorkoutId: healthId,
      };
    }
  }

  const slots = assignLegacySlots(required, parts);
  const mediaUrls = uploaded.map((item) => item.url);
  const notes = [...textBits, input.notes?.trim(), slots.notes].filter(Boolean).join('\n') || null;

  const { data, error } = await supabase.rpc('log_workout', {
    p_challenge_id: input.challengeId,
    p_submission_date: utcDateStamp(),
    p_pre_selfie_url: slots.pre || uploaded.find((item) => item.type === 'pre_selfie')?.url || '',
    p_post_selfie_url: slots.post || uploaded.find((item) => item.type === 'post_selfie')?.url || '',
    p_hr_monitor_url: slots.hr || uploaded.find((item) => item.type === 'hr_monitor')?.url || '',
    p_notes: notes,
    p_task_ids: [],
    p_proof_parts: parts,
    p_health_workout_id: healthWorkoutId,
  });

  if (error) {
    throwMapped(error);
  }

  const row = (data && typeof data === 'object' && !Array.isArray(data)
    ? data
    : {}) as Record<string, unknown>;
  const parsedDays = Number(row.days_completed);
  const daysCompleted = Number.isFinite(parsedDays)
    ? parsedDays
    : await readDaysCompleted(input.challengeId, userId);

  requestPushAfterValue();

  return asResult(
    {
      ...row,
      challenge_id: row.challenge_id ?? input.challengeId,
      user_id: row.user_id ?? userId,
      notes: row.notes ?? notes,
    },
    mediaUrls,
    daysCompleted,
    parts,
  );
}

export function proofUploadType(proof: ChallengeProof): ProofType {
  return captureTypeForMethod(proof.method);
}
