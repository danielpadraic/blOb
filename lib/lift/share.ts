import { checkinHidesHomeShare } from '@/lib/checkinShare';
import { buildRecap, recapFallbackText } from '@/lib/lift/recap';
import { postShareUrl } from '@/lib/postShare';
import { supabase } from '@/lib/supabase';
import type { LiftSessionDraft } from '@/lib/lift/types';
import type { PostAudience } from '@/lib/postAudience';

/**
 * Publishing a lift recap.
 *
 * One session makes one post. Picking a challenge puts that post in the challenge's Live thread;
 * the Home toggle decides whether the same post also shows on Home. That is exactly how a check-in
 * behaves, so a lift card obeys the audience rules people already understand.
 *
 * Sharing is the only thing that makes a lift readable by anyone else. Until a post points at it,
 * the session stays owner-only by policy.
 */

export type LiftShareInput = {
  draft: LiftSessionDraft;
  /** Their words. An empty caption stays empty — the app never writes "Daniel crushed chest". */
  caption?: string | null;
  /** Live: the challenge whose thread this lands in, or null for a Home-only card. */
  challengeId?: string | null;
  /** Live: the Circle room this lands in. Never set alongside a challenge. */
  circleId?: string | null;
  /** Home: whether the card also appears on the Home feed. */
  home: boolean;
  audience: PostAudience;
  audienceUserIds?: string[];
};

export type LiftSharedPost = {
  postId: string;
  challengeId: string | null;
};

function fail(message: string, error: { message?: string } | null): never {
  throw new Error(error?.message ? `${message}: ${error.message}` : message);
}

function isMissingColumn(error: { message?: string; code?: string } | null, column: string): boolean {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`.toLowerCase();
  return text.includes(column) && (text.includes('does not exist') || text.includes('schema cache'));
}

/**
 * Creates the post that carries the recap card.
 *
 * `content` holds a plain-text version of the same card. It is what a stale client, a search index,
 * or a notification preview shows, so the post is never an empty shell around a structured column.
 */
export async function shareLiftSession(input: LiftShareInput): Promise<LiftSharedPost> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) {
    throw new Error('You need to be signed in.');
  }

  const recap = buildRecap(input.draft);
  const caption = String(input.caption ?? '').trim();
  const challengeId = input.challengeId ?? null;
  const circleId = input.circleId ?? null;
  // The posts table refuses to hold both, so catching it here beats a constraint error the user
  // would have to interpret.
  if (challengeId && circleId) {
    throw new Error('A lift card goes to a challenge or a Circle, not both.');
  }

  const payload: Record<string, unknown> = {
    author_id: userId,
    challenge_id: challengeId,
    circle_id: circleId,
    content: caption || recapFallbackText(recap),
    media_urls: [],
    audience: input.audience,
    audience_user_ids: input.audienceUserIds ?? [],
    type: 'lift_session',
    source: challengeId ? 'challenge' : circleId ? 'circle' : 'feed',
    lift_session_id: input.draft.id,
    hidden_from_home: !input.home,
  };

  const { data, error } = await supabase.from('posts').insert(payload).select('id').single();
  if (error) {
    fail('Could not share that lift', error);
  }

  const postId = String((data as { id: string }).id);
  await linkSessionToPost(input.draft.id, postId);
  return { postId, challengeId };
}

/**
 * Puts a published lift card in front of named people.
 *
 * Several recipients become one group thread rather than a stack of identical private DMs — the
 * people you send a session to are usually the people you train with, and they should be able to
 * answer each other. One recipient stays a plain 1:1.
 *
 * The post is what carries read access, so this runs after the card exists and only ever adds the
 * link on top. A DM that fails does not undo a share the others can already see.
 */
export async function sendLiftToRecipients(input: {
  postId: string;
  recipientIds: readonly string[];
  caption?: string | null;
  startChat: (friendId: string) => Promise<{ id: string }>;
  startGroup: (friendIds: string[]) => Promise<{ id: string }>;
  send: (message: { conversation_id: string; body: string }) => Promise<void>;
}): Promise<number> {
  const url = postShareUrl(input.postId);
  const caption = String(input.caption ?? '').trim();
  const body = caption ? `${caption}\n${url}` : url;
  const recipients = [...new Set(input.recipientIds.filter(Boolean))];

  if (recipients.length > 1) {
    try {
      const conversation = await input.startGroup(recipients);
      await input.send({ conversation_id: conversation.id, body });
      return recipients.length;
    } catch (error) {
      // A group needs everyone to be an accepted friend. Rather than dropping the share, fall back
      // to individual threads, which have no such requirement.
      console.warn('Could not open a group for the lift, sending one by one', error);
    }
  }

  let sent = 0;
  for (const friendId of recipients) {
    try {
      const conversation = await input.startChat(friendId);
      await input.send({ conversation_id: conversation.id, body });
      sent += 1;
    } catch (error) {
      console.warn('Could not send the lift in a DM', error);
    }
  }
  return sent;
}

/** Records the post on the session so History can show "Shared" and offer the link again. */
export async function linkSessionToPost(sessionId: string, postId: string | null): Promise<void> {
  const { error } = await supabase.rpc('set_lift_session_post', {
    p_session_id: sessionId,
    p_post_id: postId,
  });
  if (error && !isMissingColumn(error, 'set_lift_session_post')) {
    // The card is already published; failing to backfill the pointer is not worth a visible error.
    console.warn('Could not link the lift to its post', error.message);
  }
}

/**
 * Which of these challenges keep their check-ins inside the lobby.
 *
 * `LoggableChallenge` does not carry `privacy_mode`, so the Done sheet asks for it directly rather
 * than guessing. A corporate lobby locks Home off exactly as it does for a check-in.
 */
export async function fetchChallengeShareLocks(ids: readonly string[]): Promise<string[]> {
  const wanted = [...new Set(ids.filter(Boolean))];
  if (!wanted.length) {
    return [];
  }
  const { data, error } = await supabase
    .from('challenges')
    .select('id, privacy_mode, visibility, challenge_lane')
    .in('id', wanted);
  if (error) {
    // Failing closed is the safe direction: no Home toggle beats leaking a private lobby to Home.
    return wanted;
  }
  return (data ?? [])
    .filter((row) => checkinHidesHomeShare(row as Parameters<typeof checkinHidesHomeShare>[0]))
    .map((row) => String((row as { id: string }).id));
}

/** The post carrying a session's card, if it has been shared. Used to reopen or copy the link. */
export async function fetchLiftPostId(sessionId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('posts')
    .select('id')
    .eq('lift_session_id', sessionId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) {
    return null;
  }
  const row = (data ?? [])[0] as { id?: string } | undefined;
  return row?.id ? String(row.id) : null;
}
