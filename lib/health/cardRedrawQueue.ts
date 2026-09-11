import {
  cardRepairFor,
  type CardRepair,
  type CardRepairScope,
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

/**
 * Newest first, so the card someone is most likely looking at is the first one fixed.
 *
 * `scope` says what this device can actually do about a card. It is applied before the check-in
 * rows are even read, so a platform that can never supply a heart-rate trace does no database work
 * for cards that only want one.
 */
export async function pendingCardRepairs(
  userId: string,
  scope?: CardRepairScope,
): Promise<CardRepair[]> {
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
    const repair = cardRepairFor(row, undefined, scope);
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
    return byUrgency(candidates);
  }
  return byUrgency(
    rows
      .map((row) => cardRepairFor(row, labels, scope))
      .filter((item): item is CardRepair => Boolean(item?.challengeId)),
  ).slice(0, BATCH);
}

/**
 * Stale cards ahead of cards that are only chasing their heart-rate graph.
 *
 * A workout whose samples are gone from Health can never be filled, and it sits in the queue asking
 * every time the app opens. Without this it would take a batch slot from a card that still has a wrong
 * number on it. Sort is stable, so newest-first survives inside each group.
 */
function byUrgency(items: CardRepair[]): CardRepair[] {
  return [...items].sort((a, b) => Number(a.reason === 'trace') - Number(b.reason === 'trace'));
}

/**
 * Put the drawn card on the post.
 *
 * Deliberately not `save_checkin_proof`: that RPC works out the period from the clock, so it can only
 * ever write today's check-in, and aiming it at an earlier day would rewrite the wrong one. This names
 * the check-in and swaps only the picture.
 */
export async function putRepairedCard(
  item: CardRepair,
  fileUri: string,
  /**
   * The heart-rate trace this pass read back from Health, when the workout still has one.
   *
   * The only way a trace reaches an already-posted card. Everything else the card prints was stored at
   * attach time, but the series was not, so it has to be re-read on the owner's device and stored now —
   * after which the post draws its graph for every viewer, including Web.
   */
  hrSeries?: number[] | null,
): Promise<string> {
  const { data: session } = await supabase.auth.getUser();
  const userId = session?.user?.id;
  if (!userId) {
    throw new Error('Not signed in.');
  }
  const path = await uploadChallengeProof({
    uri: fileUri,
    userId,
    challengeId: item.challengeId,
    proofType: 'workout_card',
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
    // Null leaves whatever trace the snapshot already had. A workout that has aged out of Health, or
    // never carried heart rate, must not have its stored series wiped by a redraw.
    p_hr_series: hrSeries && hrSeries.length > 0 ? hrSeries : null,
  });
  if (error) {
    throw new Error(error.message || 'Could not update that workout card.');
  }
  return url;
}

/**
 * Apple's own wording for each of these workouts, keyed the way the proof slot refers to them.
 *
 * A slot's `healthWorkoutId` is the `health_workouts` row id, not a vendor id — so that is the table
 * asked and `id` is the column matched. This previously looked in `workout_sessions.vendor_workout_id`,
 * which nothing writes, so every card fell back to humanizing the stored type and a game of pickleball
 * came out as "Other".
 *
 * Owner-scoped by row-level security, which is the right shape: the repair pass only ever redraws the
 * cards of the person whose device it is running on.
 */
async function activityLabelsFor(
  userId: string,
  ids: Array<string | null>,
): Promise<StoredActivityLabels | null> {
  const wanted = ids.filter((id): id is string => Boolean(id));
  if (wanted.length === 0) {
    return null;
  }
  const rows = await supabase
    .from('health_workouts')
    .select('id, activity_label')
    .eq('user_id', userId)
    .in('id', wanted);
  if (rows.error || !rows.data?.length) {
    return null;
  }
  const labels: StoredActivityLabels = {};
  for (const row of rows.data as Array<{ id?: string | null; activity_label?: string | null }>) {
    if (row.id) {
      labels[row.id] = row.activity_label ?? null;
    }
  }
  return labels;
}
