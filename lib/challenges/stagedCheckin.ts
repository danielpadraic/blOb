import { saveCheckinProofWithClient, submitCheckinWithClient, parseChallengeCheckin } from '@/lib/checkin/rpc';
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
