import { redrawFor, type CardRedraw, type StoredSessionRow } from '@/lib/health/cardRedraw';
import { supabase } from '@/lib/supabase';

/**
 * Reading and clearing the redraw queue.
 *
 * The queue is `workout_sessions.card_needs_redraw`, which the repair migration set on the rows whose
 * stored card no longer matches their own numbers. It is owner-scoped by RLS, so a user only ever
 * sees and clears their own cards.
 */

const SESSION_COLUMNS = 'id, checkin_id, challenge_id, activity_label, vendor_workout_id';

/** Small on purpose: this runs on app open and must never look like a sync. */
const BATCH = 5;

export async function pendingCardRedraws(userId: string): Promise<CardRedraw[]> {
  if (!userId) {
    return [];
  }
  const sessions = await supabase
    .from('workout_sessions')
    .select(SESSION_COLUMNS)
    .eq('user_id', userId)
    .eq('card_needs_redraw', true)
    .not('checkin_id', 'is', null)
    .order('started_at', { ascending: false })
    .limit(BATCH);

  // A missing column means the repair migration has not reached this project yet. There is nothing
  // to redraw, and nothing to report — the app carries on.
  if (sessions.error || !sessions.data?.length) {
    return [];
  }

  const rows = sessions.data as StoredSessionRow[];
  const checkinIds = rows.map((row) => row.checkin_id).filter((id): id is string => Boolean(id));
  const checkins = await supabase
    .from('challenge_checkins')
    .select('id, challenge_id, proof_parts')
    .in('id', checkinIds);
  if (checkins.error || !checkins.data?.length) {
    return [];
  }

  const byId = new Map(checkins.data.map((row) => [String(row.id), row]));
  const work: CardRedraw[] = [];
  for (const session of rows) {
    const checkin = session.checkin_id ? byId.get(session.checkin_id) : null;
    if (!checkin) {
      continue;
    }
    const item = redrawFor(session, {
      id: String(checkin.id),
      challenge_id: String(checkin.challenge_id),
      proof_parts: checkin.proof_parts,
    });
    if (item?.challengeId) {
      work.push(item);
    }
  }
  return work;
}

/**
 * Drop the flag once the card on the post is the redrawn one. Best effort: a card that was replaced
 * but failed to unflag is only redrawn once more, which is harmless. Losing the check-in over a
 * bookkeeping write would not be.
 */
export async function clearCardRedraw(sessionId: string): Promise<void> {
  try {
    await supabase
      .from('workout_sessions')
      .update({ card_needs_redraw: false, updated_at: new Date().toISOString() })
      .eq('id', sessionId);
  } catch {
    // Retried on the next open.
  }
}
