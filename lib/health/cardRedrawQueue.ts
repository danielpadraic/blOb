import {
  cardRepairFor,
  type CardRepair,
  type StoredActivityLabels,
  type StoredCheckinRow,
} from '@/lib/health/cardRedraw';
import { WORKOUT_CARD_VERSION } from '@/lib/health/workoutProofCard';
import { supabase } from '@/lib/supabase';
import { challengeProofUrl, uploadChallengeProof } from '@/utils/upload';

/**
 * Finding the posted workout cards that need drawing again.
 *
 * The queue is derived, not stored: a check-in needs a card when one of its proof slots holds a vendor
 * health snapshot whose card was not drawn by the current renderer. That keeps the pass self-healing —
 * bumping `WORKOUT_CARD_VERSION` is all it takes to sweep up every card a change invalidated — and it
 * means a check-in with no `workout_sessions` ledger row is still repairable, which the flag-on-the-
 * ledger approach could never manage.
 *
 * RLS scopes check-ins to their owner, so a user only ever sees and repairs their own cards. Nobody
 * can fix a card for somebody else, by design.
 */

/** Small on purpose: this runs on app open and must never look like a sync. */
const BATCH = 4;

/** Newest first, so the card someone is most likely looking at is the first one fixed. */
export async function pendingCardRepairs(userId: string): Promise<CardRepair[]> {
  if (!userId) {
    return [];
  }
  const checkins = await supabase
    .from('challenge_checkins')
    .select('id, challenge_id, proof_parts')
    .eq('user_id', userId)
    .not('proof_parts', 'is', null)
    .order('created_at', { ascending: false })
    .limit(40);
  if (checkins.error || !checkins.data?.length) {
    return [];
  }

  const rows = checkins.data as StoredCheckinRow[];
  const candidates: CardRepair[] = [];
  for (const row of rows) {
    const repair = cardRepairFor(row);
    if (repair?.challengeId) {
      candidates.push(repair);
    }
    if (candidates.length >= BATCH) {
      break;
    }
  }
  if (candidates.length === 0) {
    return [];
  }

  // Apple's own wording for the activity ("Outdoor Walk" rather than "Walking") only survived on the
  // ledger, so the labels are looked up once and folded in. Missing rows are fine: the card falls back
  // to the humanized type, which is what the original drew.
  const labels = await activityLabelsFor(
    userId,
    candidates.map((item) => item.healthWorkoutId),
  );
  if (!labels) {
    return candidates;
  }
  return rows
    .map((row) => cardRepairFor(row, labels))
    .filter((item): item is CardRepair => Boolean(item?.challengeId))
    .slice(0, BATCH);
}

/**
 * Put the drawn card on the post.
 *
 * Deliberately not `save_checkin_proof`: that RPC works out the period from the clock, so it can only
 * ever write today's check-in, and aiming it at an earlier day would rewrite the wrong one. This names
 * the check-in and swaps only the picture.
 */
export async function putRepairedCard(item: CardRepair, fileUri: string): Promise<void> {
  const { data: session } = await supabase.auth.getUser();
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error('Not signed in.');
  }
  const path = await uploadChallengeProof({
    uri: fileUri,
    userId,
    challengeId: item.challengeId,
    proofType: 'hr_monitor',
    mimeType: 'image/png',
  });
  const url = await challengeProofUrl(path);
  if (!url) {
    throw new Error('Could not store that workout card.');
  }
  const { error } = await supabase.rpc('repair_checkin_workout_card', {
    p_checkin_id: item.checkinId,
    p_proof_id: item.proofId,
    p_url: url,
    p_card_version: WORKOUT_CARD_VERSION,
  });
  if (error) {
    throw new Error(error.message || 'Could not update that workout card.');
  }
}

async function activityLabelsFor(
  userId: string,
  ids: Array<string | null>,
): Promise<StoredActivityLabels | null> {
  const wanted = ids.filter((id): id is string => Boolean(id));
  if (wanted.length === 0) {
    return null;
  }
  const sessions = await supabase
    .from('workout_sessions')
    .select('vendor_workout_id, activity_label')
    .eq('user_id', userId)
    .in('vendor_workout_id', wanted);
  if (sessions.error || !sessions.data?.length) {
    return null;
  }
  const labels: StoredActivityLabels = {};
  for (const row of sessions.data as Array<{ vendor_workout_id?: string | null; activity_label?: string | null }>) {
    if (row.vendor_workout_id) {
      labels[row.vendor_workout_id] = row.activity_label ?? null;
    }
  }
  return labels;
}
