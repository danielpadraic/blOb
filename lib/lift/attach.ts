import { saveCheckinProof } from '@/lib/challenges/stagedCheckin';
import { buildRecap, recapFallbackText } from '@/lib/lift/recap';
import { linkSessionToPost } from '@/lib/lift/share';
import { supabase } from '@/lib/supabase';
import type { LiftSessionDraft } from '@/lib/lift/types';

/**
 * Attaching a finished lift to a live lifting challenge.
 *
 * A check-in already owns exactly one feed post per period. This adds the recap card to that post
 * rather than publishing a second one, which is why it goes through `save_checkin_proof` — the same
 * RPC the check-in screen uses — instead of inserting anything itself.
 *
 * The lift is extra structured proof. It does not satisfy a photo or video the challenge requires:
 * the check-in stays in progress until those slots are filled in the normal flow.
 */

export type LiftAttachResult = {
  checkinId: string | null;
  postId: string | null;
  /** True when the challenge still wants proof the lift cannot supply. */
  needsMoreProof: boolean;
};

export async function attachLiftToCheckin(input: {
  draft: LiftSessionDraft;
  challengeId: string;
  caption?: string | null;
  /** Whether the check-in post also shows on Home. Corporate lobbies pass false. */
  home: boolean;
}): Promise<LiftAttachResult> {
  const recap = buildRecap(input.draft);
  const caption = String(input.caption ?? '').trim();

  // Creates the period check-in if it does not exist yet, and writes / updates its single post.
  const checkin = await saveCheckinProof({
    challengeId: input.challengeId,
    notes: caption || recapFallbackText(recap),
  });

  const checkinId = readCheckinId(checkin);
  if (!checkinId) {
    return { checkinId: null, postId: null, needsMoreProof: true };
  }

  // The check-in exists now, so its post does too. No post means something is wrong rather than
  // "nothing to do": returning quietly here would land them on the lobby with no card and no reason.
  const postId = await findCheckinPostId(checkinId);
  if (!postId) {
    throw new Error('Your check-in saved, but the lift card could not be added to it. Try again.');
  }

  // Pointing the existing post at the session is what turns the note into a card, and carries the
  // Home choice they just made onto the same post a check-in would have used.
  const { error } = await supabase
    .from('posts')
    .update({ lift_session_id: input.draft.id, hidden_from_home: !input.home })
    .eq('id', postId);
  if (error) {
    throw new Error(`Could not put the lift on your check-in: ${error.message}`);
  }
  await linkSessionToPost(input.draft.id, postId);

  return {
    checkinId,
    postId,
    needsMoreProof: readPhase(checkin) !== 'submitted',
  };
}

function readCheckinId(checkin: unknown): string | null {
  const row = checkin as { id?: unknown; checkin_id?: unknown } | null;
  const id = row?.id ?? row?.checkin_id;
  return typeof id === 'string' && id ? id : null;
}

function readPhase(checkin: unknown): string {
  const row = checkin as { phase?: unknown; status?: unknown } | null;
  return String(row?.phase ?? row?.status ?? '');
}

async function findCheckinPostId(checkinId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('posts')
    .select('id')
    .eq('checkin_id', checkinId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) {
    // A failed lookup is not the same as no post. Let the caller surface it.
    throw new Error(`Could not find your check-in post: ${error.message}`);
  }
  const row = (data ?? [])[0] as { id?: string } | undefined;
  return row?.id ? String(row.id) : null;
}
