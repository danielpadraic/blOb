import { checkinHidesHomeShare } from '@/lib/checkinShare';
import { counterCardFallbackText, type CounterCardModel } from '@/lib/counter/card';
import { sendLiftToRecipients } from '@/lib/lift/share';
import { DEFAULT_POST_AUDIENCE, type PostAudience } from '@/lib/postAudience';
import { createStory } from '@/lib/social';
import { supabase } from '@/lib/supabase';

export type CounterShareDestination = 'image' | 'home' | 'live' | 'circle' | 'wave' | 'message';

export type CounterShareInput = {
  card: CounterCardModel;
  cardUrl: string;
  caption?: string | null;
  destination: CounterShareDestination;
  challengeId?: string | null;
  circleId?: string | null;
  hideHome?: boolean;
  audience?: PostAudience;
  audienceUserIds?: string[];
};

function fail(message: string, error: { message?: string } | null): never {
  throw new Error(error?.message ? `${message}: ${error.message}` : message);
}

export async function shareCounterCard(input: CounterShareInput): Promise<{ postId: string | null }> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) {
    throw new Error('You need to be signed in.');
  }
  const caption = String(input.caption ?? '').trim();
  const body = caption || counterCardFallbackText(input.card);
  const challengeId = input.challengeId ?? null;
  const circleId = input.circleId ?? null;

  if (input.destination === 'wave') {
    const stories = await createStory(userId, {
      media_url: input.cardUrl,
      media_type: 'image',
      caption,
    });
    const payload: Record<string, unknown> = {
      author_id: userId,
      content: caption || null,
      media_urls: [input.cardUrl],
      type: 'wave',
      source: 'feed',
      hidden_from_home: true,
      audience: input.audience ?? DEFAULT_POST_AUDIENCE,
    };
    const created = await supabase.from('posts').insert(payload).select('id').single();
    if (created.error) {
      fail('Could not put that on Wave', created.error);
    }
    void stories;
    return { postId: String((created.data as { id: string }).id) };
  }

  let hideHome = Boolean(input.hideHome);
  if (challengeId) {
    const challenge = await supabase
      .from('challenges')
      .select('privacy_mode, visibility, challenge_lane')
      .eq('id', challengeId)
      .maybeSingle();
    if (checkinHidesHomeShare(challenge.data)) {
      hideHome = true;
    }
  }

  const payload: Record<string, unknown> = {
    author_id: userId,
    challenge_id: challengeId,
    circle_id: circleId,
    content: body,
    media_urls: [input.cardUrl],
    type: 'feed',
    source: challengeId ? 'challenge' : circleId ? 'circle' : 'feed',
    hidden_from_home: hideHome || input.destination === 'message',
    audience: input.audience ?? DEFAULT_POST_AUDIENCE,
    audience_user_ids: input.audienceUserIds ?? [],
  };
  const created = await supabase.from('posts').insert(payload).select('id').single();
  if (created.error) {
    fail('Could not share that counter', created.error);
  }
  return { postId: String((created.data as { id: string }).id) };
}

export { sendLiftToRecipients as sendCounterToRecipients };
