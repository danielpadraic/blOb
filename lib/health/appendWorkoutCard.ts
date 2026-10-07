import { parseCheckinHealthProof } from '@/lib/health/checkinHealthProof';
import { isVendorHealthProof } from '@/lib/health/cardRedraw';
import { mediaWithExtraCard, proofPartWithExtraCard, workoutCardPostIds } from '@/lib/health/workoutCardSlide';
import { officialCoinKind } from '@/lib/officialCoin';
import type { CheckinProofStats } from '@/lib/checkin/proofStats';
import { supabase } from '@/lib/supabase';
import { challengeProofUrl, uploadChallengeProof } from '@/utils/upload';
import { WORKOUT_CARD_VERSION } from '@/lib/health/workoutProofCard';

export { mediaWithExtraCard, proofPartWithExtraCard } from '@/lib/health/workoutCardSlide';

type CheckinCardRow = {
  id: string;
  user_id: string;
  challenge_id: string;
  period_key: string;
  proof_parts: Record<string, Record<string, unknown>> | null;
};

function asParts(value: unknown): Record<string, Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, Record<string, unknown>>;
}

function vendorProofId(parts: Record<string, Record<string, unknown>>, preferred?: string | null): string | null {
  if (preferred && parts[preferred]) {
    const health = parseCheckinHealthProof(parts[preferred].health);
    if (health && isVendorHealthProof(health, { healthWorkoutId: String(parts[preferred].healthWorkoutId ?? '') || null })) {
      return preferred;
    }
  }
  for (const [proofId, part] of Object.entries(parts)) {
    const health = parseCheckinHealthProof(part.health);
    if (health && isVendorHealthProof(health, { healthWorkoutId: String(part.healthWorkoutId ?? '') || null })) {
      return proofId;
    }
  }
  return preferred && parts[preferred] ? preferred : null;
}

type LiveCardPost = {
  id: string;
  challenge_id: string | null;
  checkin_id: string | null;
  media_urls: string[] | null;
  checkin_stats: unknown;
};

async function livePostsFor(userId: string, checkinIds: string[]): Promise<LiveCardPost[]> {
  const ids = [...new Set(checkinIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    return [];
  }
  const posts = await supabase
    .from('posts')
    .select('id, challenge_id, checkin_id, media_urls, checkin_stats')
    .eq('author_id', userId)
    .in('checkin_id', ids)
    .is('deleted_at', null);
  if (posts.error) {
    throw new Error(posts.error.message || 'Could not show that workout card.');
  }
  return (posts.data ?? []) as LiveCardPost[];
}

/**
 * Save the recap on this check-in, then patch this room's Live post and the Official
 * twin for the same Chicago day (`period_key`). Selfies and screenshots stay; the card
 * is one extra slide. A missing post is left for a later append — it does not throw.
 */
async function writeCardOnCheckin(row: CheckinCardRow, proofId: string, cardUrl: string): Promise<void> {
  const parts = asParts(row.proof_parts);
  const slotId = vendorProofId(parts, proofId) ?? proofId;
  const part = parts[slotId] ?? {};
  parts[slotId] = proofPartWithExtraCard(part, cardUrl, WORKOUT_CARD_VERSION);
  const saved = await supabase
    .from('challenge_checkins')
    .update({ proof_parts: parts } as never)
    .eq('id', row.id)
    .eq('user_id', row.user_id);
  if (saved.error) {
    throw new Error(saved.error.message || 'Could not save that workout card.');
  }

  let sibling: CheckinCardRow | null = null;
  let siblingError: unknown = null;
  try {
    sibling = await officialSibling(row);
  } catch (error) {
    siblingError = error;
  }
  const posts = await livePostsFor(row.user_id, [row.id, sibling?.id ?? '']);
  const wanted = new Set(
    workoutCardPostIds({
      challengeId: row.challenge_id,
      checkinId: row.id,
      siblingChallengeId: sibling?.challenge_id,
      siblingCheckinId: sibling?.id,
      posts: posts.map((post) => ({
        id: post.id,
        challengeId: String(post.challenge_id ?? ''),
        checkinId: String(post.checkin_id ?? ''),
      })),
    }),
  );
  for (const post of posts) {
    if (!wanted.has(post.id)) {
      continue;
    }
    const prior =
      post.checkin_stats && typeof post.checkin_stats === 'object'
        ? (post.checkin_stats as CheckinProofStats)
        : {};
    const media = mediaWithExtraCard(post.media_urls, cardUrl);
    const write = await supabase
      .from('posts')
      .update({
        media_urls: media,
        checkin_stats: { ...prior, card_url: cardUrl },
      })
      .eq('id', post.id);
    if (write.error) {
      throw new Error(write.error.message || 'Could not show that workout card.');
    }
  }
  if (siblingError) {
    throw siblingError;
  }
}

async function officialSibling(row: CheckinCardRow): Promise<CheckinCardRow | null> {
  const mine = await supabase
    .from('challenges')
    .select('id, official_kind')
    .eq('id', row.challenge_id)
    .maybeSingle();
  if (mine.error) {
    throw new Error(mine.error.message || 'Could not show that workout card.');
  }
  if (!officialCoinKind(mine.data)) {
    return null;
  }
  const rooms = await supabase
    .from('challenges')
    .select('id, official_kind')
    .in('official_kind', ['coin_weekly', 'coin_monthly'])
    .neq('id', row.challenge_id);
  if (rooms.error) {
    throw new Error(rooms.error.message || 'Could not show that workout card.');
  }
  const ids = (rooms.data ?? [])
    .filter((room) => officialCoinKind(room))
    .map((room) => String(room.id ?? ''))
    .filter(Boolean);
  if (ids.length === 0) {
    return null;
  }
  const sibling = await supabase
    .from('challenge_checkins')
    .select('id, user_id, challenge_id, period_key, proof_parts')
    .eq('user_id', row.user_id)
    .eq('period_key', row.period_key)
    .in('challenge_id', ids)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (sibling.error) {
    throw new Error(sibling.error.message || 'Could not show that workout card.');
  }
  if (!sibling.data?.id) {
    return null;
  }
  return sibling.data as CheckinCardRow;
}

/**
 * Upload the raster and append it to this check-in and, for Official, the other room's same day.
 * Does not create a post. Does not remove a selfie or a screenshot.
 */
export async function storeRenderedWorkoutCard(input: {
  userId: string;
  checkinId: string;
  challengeId: string;
  proofId: string;
  fileUri: string;
}): Promise<{ cardUrl: string; siblingCheckinId: string | null }> {
  const path = await uploadChallengeProof({
    uri: input.fileUri,
    userId: input.userId,
    challengeId: input.challengeId,
    proofType: 'workout_card',
    mimeType: 'image/png',
  });
  const cardUrl = await challengeProofUrl(path);
  if (!cardUrl) {
    throw new Error('Could not store that workout card.');
  }
  const siblingCheckinId = await appendWorkoutCardUrl({
    userId: input.userId,
    checkinId: input.checkinId,
    proofId: input.proofId,
    cardUrl,
  });
  return { cardUrl, siblingCheckinId };
}

/** Point an existing check-in (and its Official twin) at a card file that is already stored. */
export async function appendWorkoutCardUrl(input: {
  userId: string;
  checkinId: string;
  proofId: string;
  cardUrl: string;
}): Promise<string | null> {
  const loaded = await supabase
    .from('challenge_checkins')
    .select('id, user_id, challenge_id, period_key, proof_parts')
    .eq('id', input.checkinId)
    .eq('user_id', input.userId)
    .maybeSingle();
  if (loaded.error || !loaded.data?.id) {
    throw new Error(loaded.error?.message || 'Could not find that check-in.');
  }
  const row = loaded.data as CheckinCardRow;
  await writeCardOnCheckin(row, input.proofId, input.cardUrl);
  const sibling = await officialSibling(row);
  if (!sibling) {
    return null;
  }
  await writeCardOnCheckin(sibling, input.proofId, input.cardUrl);
  return sibling.id;
}
