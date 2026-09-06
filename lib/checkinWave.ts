import {
  applyCheckinShareLock,
  checkinHidesHomeShare,
  prefsFromProfile,
  readLocalSharePrefs,
  type CheckinSharePrefs,
  type CheckinWaveSource,
} from '@/lib/checkinShare';
import { asDefaultPostAudience, DEFAULT_POST_AUDIENCE } from '@/lib/postAudience';
import { resolvePostsSchema } from '@/lib/postsSelect';
import { publishedRowId } from '@/lib/routes';
import { attachClipPostId, createStory } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import { mediaUrlKey } from '@/lib/challengeProofs';

function sameMedia(left?: string | null, right?: string | null): boolean {
  const a = mediaUrlKey(left ?? '');
  const b = mediaUrlKey(right ?? '');
  return Boolean(a) && a === b;
}

async function insertWavePost(input: {
  userId: string;
  challengeId: string;
  wave: CheckinWaveSource;
  audience: string;
}): Promise<string | null> {
  const schema = await resolvePostsSchema();
  const payload: Record<string, unknown> = {
    author_id: input.userId,
    challenge_id: input.challengeId,
    content: input.wave.caption || null,
    media_urls: [input.wave.url],
  };
  if (schema.hasAudience) {
    payload.audience = input.audience || DEFAULT_POST_AUDIENCE;
    payload.audience_user_ids = [];
  }
  if (schema.hasSource) {
    payload.source = 'feed';
  }
  if (schema.hasType) {
    payload.type = 'wave';
  }
  if (schema.hasDuration && input.wave.durationMs != null) {
    payload.duration_ms = input.wave.durationMs;
  }
  const created = await supabase.from('posts').insert(payload).select('id').single();
  return publishedRowId(created.data);
}

/**
 * One Wave on the author's stack for this check-in. Type `wave`. Does nothing when Share-to-Wave
 * is off.
 */
export async function publishCheckinWave(input: {
  userId: string;
  challengeId: string;
  wave: CheckinWaveSource;
  audience?: string | null;
}): Promise<boolean> {
  const url = input.wave.url.trim();
  if (!url || url.startsWith('health:')) {
    return false;
  }
  const stories = await createStory(input.userId, {
    media_url: url,
    media_type: input.wave.mediaType,
    caption: input.wave.caption,
    challenge_id: input.challengeId,
  });
  const storyId = publishedRowId(stories);
  if (!storyId) {
    return false;
  }
  try {
    const postedId = await insertWavePost({
      userId: input.userId,
      challengeId: input.challengeId,
      wave: input.wave,
      audience: asDefaultPostAudience(input.audience),
    });
    if (postedId) {
      await attachClipPostId('story', storyId, postedId);
    }
  } catch {
    // Story is live; Friends is the missing-audience default.
  }
  return true;
}

async function sharePrefsForWave(userId: string): Promise<CheckinSharePrefs> {
  const local = await readLocalSharePrefs(userId);
  const profile = await supabase
    .from('profiles')
    .select('checkin_share_home, checkin_share_wave')
    .eq('id', userId)
    .maybeSingle();
  const fromProfile = prefsFromProfile(profile.data);
  return {
    home: local?.home ?? fromProfile.home,
    wave: local?.wave ?? fromProfile.wave,
  };
}

/**
 * After a repaired workout card is written: insert or update the Wave row when the author had
 * Share-to-Wave on. Never auto-Wave when the toggle is off. Never Wave corporate / hideHome.
 */
export async function ensureCheckinWaveForRepair(input: {
  userId: string;
  challengeId: string;
  url: string;
  previousUrl?: string | null;
}): Promise<void> {
  const url = input.url.trim();
  if (!url || url.startsWith('health:')) {
    return;
  }
  const prefs = await sharePrefsForWave(input.userId);
  const challenge = await supabase
    .from('challenges')
    .select('privacy_mode, visibility, challenge_lane')
    .eq('id', input.challengeId)
    .maybeSingle();
  const locked = applyCheckinShareLock(prefs, checkinHidesHomeShare(challenge.data));
  if (!locked.wave) {
    return;
  }

  const existing = await supabase
    .from('stories')
    .select('id, media_url, post_id')
    .eq('user_id', input.userId)
    .eq('challenge_id', input.challengeId)
    .order('created_at', { ascending: false })
    .limit(12);
  const rows = (existing.data ?? []) as Array<{
    id?: string;
    media_url?: string | null;
    post_id?: string | null;
  }>;
  const match =
    rows.find((row) => sameMedia(row.media_url, input.previousUrl) || sameMedia(row.media_url, url)) ??
    null;
  if (match?.id) {
    await supabase.from('stories').update({ media_url: url }).eq('id', match.id);
    if (match.post_id) {
      await supabase.from('posts').update({ media_urls: [url] }).eq('id', match.post_id);
    }
    return;
  }

  const profile = await supabase
    .from('profiles')
    .select('default_post_audience')
    .eq('id', input.userId)
    .maybeSingle();
  await publishCheckinWave({
    userId: input.userId,
    challengeId: input.challengeId,
    wave: { url, mediaType: 'image', caption: '' },
    audience: profile.data?.default_post_audience as string | null,
  });
}
