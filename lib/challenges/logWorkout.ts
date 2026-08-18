import { supabase } from '@/lib/supabase';
import type { ProofType, WorkoutSubmission } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';
import { challengeProofUrl, uploadChallengeProof } from '@/utils/upload';

export type LogWorkoutProof = {
  type: ProofType;
  uri: string;
  mimeType?: string | null;
};

export type LogWorkoutInput = {
  challengeId: string;
  proofs: LogWorkoutProof[];
  notes?: string | null;
};

export type LogWorkoutResult = WorkoutSubmission & {
  days_completed: number;
  media_urls: string[];
};

const SLOT_TYPES: ProofType[] = ['pre_selfie', 'post_selfie', 'hr_monitor'];
const TEXT_TYPES = new Set<ProofType>(['text_note', 'link']);

function throwMapped(error: { message?: string; code?: string; details?: string }): never {
  const blob = [error.code, error.message, error.details].filter(Boolean).join(' ');
  const upper = blob.toUpperCase();
  if (upper.includes('ALREADY_LOGGED_TODAY')) {
    throw new Error('Already logged today. Come back tomorrow.');
  }
  if (upper.includes('MISSING_PROOFS')) {
    throw new Error('Add every required proof to log today.');
  }
  if (upper.includes('NOT_PARTICIPANT')) {
    throw new Error('Join this challenge before logging.');
  }
  if (upper.includes('NOT_STARTED')) {
    throw new Error('This challenge hasn’t started yet.');
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
    created_at: String(row.created_at ?? new Date().toISOString()),
    days_completed: daysCompleted,
    media_urls: mediaUrls,
  };
}

export async function logWorkout(input: LogWorkoutInput): Promise<LogWorkoutResult> {
  const { data: session } = await supabase.auth.getUser();
  const userId = session.user?.id;
  if (!userId) {
    throw new Error('You need to be signed in.');
  }

  const textBits = input.proofs
    .filter((item) => TEXT_TYPES.has(item.type) && item.uri.trim())
    .map((item) => item.uri.trim());
  const mediaProofs = input.proofs.filter((item) => !TEXT_TYPES.has(item.type) && item.uri.trim());
  if (mediaProofs.length === 0 && textBits.length === 0 && !input.notes?.trim()) {
    throw new Error('Add every required proof to log today.');
  }

  const uploaded = await Promise.all(
    mediaProofs.map(async (item) => ({
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

  const byType = new Map(uploaded.map((item) => [item.type, item.url]));
  const extras = uploaded.filter((item) => !SLOT_TYPES.includes(item.type)).map((item) => item.url);
  const takeExtra = (): string => extras.shift() ?? '';

  const mediaUrls = uploaded.map((item) => item.url);
  const notes = [...textBits, input.notes?.trim()].filter(Boolean).join('\n') || null;

  const { data, error } = await supabase.rpc('log_workout', {
    p_challenge_id: input.challengeId,
    p_pre_selfie_url: byType.get('pre_selfie') ?? takeExtra(),
    p_post_selfie_url: byType.get('post_selfie') ?? takeExtra(),
    p_hr_monitor_url: byType.get('hr_monitor') ?? takeExtra(),
    p_notes: notes,
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

  return asResult(
    {
      ...row,
      challenge_id: row.challenge_id ?? input.challengeId,
      user_id: row.user_id ?? userId,
      notes: row.notes ?? notes,
    },
    mediaUrls,
    daysCompleted,
  );
}
