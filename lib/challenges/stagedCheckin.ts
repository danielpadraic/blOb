import {
  saveCheckinProofWithClient,
  saveCheckinMetricValuesWithClient,
  submitCheckinWithClient,
  parseChallengeCheckin,
} from '@/lib/checkin/rpc';
import type { SaveCheckinProofInput } from '@/lib/checkin/rpc';
import { requestPushAfterValue } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import { getErrorMessage, logPostgrestError } from '@/utils/errors';
import { reportAppError } from '@/lib/appErrors';
import { challengeProofUrl, uploadChallengeProof } from '@/utils/upload';

export type { SaveCheckinProofInput };
export { parseChallengeCheckin };

export async function saveCheckinProof(input: SaveCheckinProofInput) {
  try {
    return await saveCheckinProofWithClient(
      supabase as never,
      input,
      async (upload) =>
        uploadChallengeProof({
          uri: upload.uri,
          userId: upload.userId,
          challengeId: upload.challengeId,
          proofType: upload.proofType as import('@/lib/types').ProofType,
          mimeType: upload.mimeType,
          blob: upload.blob,
        }),
      challengeProofUrl,
    );
  } catch (error) {
    logPostgrestError('checkin-save', error);
    reportAppError({ route: 'save_checkin_proof', error, payload: { challenge_id: input.challengeId } });
    throw error instanceof Error ? error : new Error(getErrorMessage(error));
  }
}

export async function submitLocationProof(input: {
  challengeId: string;
  proofId: string;
  lat: number;
  lng: number;
  accuracy_m: number | null;
}) {
  const { data, error } = await supabase.rpc('submit_location_proof', {
    p_challenge_id: input.challengeId,
    p_proof_id: input.proofId,
    p_lat: input.lat,
    p_lng: input.lng,
    p_accuracy_m: input.accuracy_m,
  });
  if (error) {
    throw new Error(error.message);
  }
  return parseChallengeCheckin((data ?? {}) as Record<string, unknown>);
}

export async function saveCheckinMetricValues(challengeId: string, values: Record<string, number>) {
  await saveCheckinMetricValuesWithClient(supabase as never, challengeId, values);
}

export async function submitCheckin(challengeId: string) {
  try {
    const parsed = await submitCheckinWithClient(supabase as never, challengeId);
    requestPushAfterValue();
    return parsed;
  } catch (error) {
    logPostgrestError('checkin-submit', error);
    reportAppError({ route: 'submit_checkin', error, payload: { challenge_id: challengeId } });
    throw error instanceof Error ? error : new Error(getErrorMessage(error));
  }
}
