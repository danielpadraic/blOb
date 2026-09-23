import {
  HONOR_CARD_PATH_PREFIX,
  honorCardStatsPayload,
  unionHonorCardMedia,
  type HonorCardModel,
} from '@/lib/checkin/honorCard';
import { rasterHonorProofCard } from '@/lib/checkin/honorCardRaster';
import type { CheckinProofStats } from '@/lib/checkin/proofStats';
import { supabase } from '@/lib/supabase';
import { uniqueProofUrls } from '@/lib/challengeProofs';
import { getErrorMessage } from '@/utils/errors';
import { uploadPostAttachment } from '@/utils/upload';

const RASTER_MS = 8000;
const POST_LOOKUP_MS = [0, 250, 600, 1200];

function honorCardLog(error: unknown) {
  console.log('[blob:honor-card]', getErrorMessage(error));
}

async function wait(ms: number) {
  if (ms <= 0) {
    return;
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function rasterOnce(card: HonorCardModel): Promise<string> {
  return Promise.race([
    rasterHonorProofCard(card),
    new Promise<string>((_, reject) => {
      setTimeout(() => reject(new Error('timeout')), RASTER_MS);
    }),
  ]);
}

async function rasterHonorCardWithRetry(card: HonorCardModel): Promise<string> {
  try {
    return await rasterOnce(card);
  } catch (first) {
    honorCardLog(first);
    return rasterOnce(card);
  }
}

export type CheckinPostRow = {
  id: string;
  media_urls: string[] | null;
  checkin_stats: CheckinProofStats | null;
};

export async function findCheckinPost(checkinId: string): Promise<CheckinPostRow | null> {
  const id = String(checkinId ?? '').trim();
  if (!id) {
    return null;
  }
  for (const delay of POST_LOOKUP_MS) {
    await wait(delay);
    const post = await supabase
      .from('posts')
      .select('id, media_urls, checkin_stats')
      .eq('checkin_id', id)
      .is('deleted_at', null)
      .maybeSingle();
    const row = post.data as CheckinPostRow | null;
    if (row?.id) {
      return {
        id: row.id,
        media_urls: row.media_urls ?? [],
        checkin_stats: row.checkin_stats ?? null,
      };
    }
    if (post.error) {
      honorCardLog(post.error);
    }
  }
  honorCardLog(`no post for checkin ${id}`);
  return null;
}

export async function writeHonorCheckinCard(input: {
  userId: string;
  postId: string;
  card: HonorCardModel;
  laneId?: string | null;
  existingMedia?: string[] | null;
  existingStats?: CheckinProofStats | null;
}): Promise<{ media_urls: string[]; checkin_stats: CheckinProofStats }> {
  let checkin_stats: CheckinProofStats;
  try {
    checkin_stats = await persistHonorStatsOnPost({
      postId: input.postId,
      card: input.card,
      laneId: input.laneId,
      existingStats: input.existingStats,
    });
  } catch (caught) {
    honorCardLog(caught);
    checkin_stats = honorCardStatsPayload({
      fields: input.card.fields,
      laneId: input.laneId,
      laneLabel: input.card.laneLabel,
      title: input.card.title,
      periodLabel: input.card.periodLabel,
      cardUrl: input.existingStats?.card_url ?? null,
    });
  }

  try {
    const fileUri = await rasterHonorCardWithRetry(input.card);
    return await persistHonorCardOnPost({
      userId: input.userId,
      postId: input.postId,
      fileUri,
      card: input.card,
      laneId: input.laneId,
      existingMedia: input.existingMedia,
      existingStats: checkin_stats,
    });
  } catch (caught) {
    honorCardLog(caught);
    return {
      media_urls: uniqueProofUrls(input.existingMedia),
      checkin_stats,
    };
  }
}

/** After submit_checkin: find the Live row (retry) and write stats + JPEG. Soft-fail. */
export async function attachHonorCardToCheckin(input: {
  userId: string;
  checkinId: string;
  card: HonorCardModel;
  laneId?: string | null;
  postId?: string | null;
  existingMedia?: string[] | null;
  existingStats?: CheckinProofStats | null;
}): Promise<{ postId: string; media_urls: string[]; checkin_stats: CheckinProofStats } | null> {
  try {
    let postId = String(input.postId ?? '').trim();
    let existingMedia = input.existingMedia;
    let existingStats = input.existingStats ?? null;
    if (!postId) {
      const found = await findCheckinPost(input.checkinId);
      if (!found) {
        return null;
      }
      postId = found.id;
      existingMedia = existingMedia ?? found.media_urls;
      existingStats = existingStats ?? found.checkin_stats;
    }
    const written = await writeHonorCheckinCard({
      userId: input.userId,
      postId,
      card: input.card,
      laneId: input.laneId,
      existingMedia,
      existingStats,
    });
    return { postId, ...written };
  } catch (caught) {
    honorCardLog(caught);
    return null;
  }
}

export async function persistHonorCardOnPost(input: {
  userId: string;
  postId: string;
  fileUri: string;
  card: HonorCardModel;
  laneId?: string | null;
  existingMedia?: string[] | null;
  existingStats?: CheckinProofStats | null;
  blob?: Blob | null;
}): Promise<{ media_urls: string[]; checkin_stats: CheckinProofStats }> {
  const remote = await uploadPostAttachment({
    uri: input.fileUri,
    userId: input.userId,
    fileStem: `${HONOR_CARD_PATH_PREFIX}${Date.now()}`,
    mimeType: 'image/jpeg',
    blob: input.blob,
  });
  const previous = String(input.existingStats?.card_url ?? '').trim() || null;
  const media_urls = unionHonorCardMedia({
    existing: input.existingMedia,
    nextCardUrl: remote,
    previousCardUrl: previous,
  });
  const checkin_stats = honorCardStatsPayload({
    fields: input.card.fields,
    laneId: input.laneId,
    laneLabel: input.card.laneLabel,
    title: input.card.title,
    periodLabel: input.card.periodLabel,
    cardUrl: remote,
  });
  const patch = await supabase
    .from('posts')
    .update({ media_urls, checkin_stats })
    .eq('id', input.postId);
  if (patch.error) {
    throw new Error(patch.error.message);
  }
  return { media_urls: uniqueProofUrls(media_urls), checkin_stats };
}

export async function persistHonorStatsOnPost(input: {
  postId: string;
  card: HonorCardModel;
  laneId?: string | null;
  existingStats?: CheckinProofStats | null;
  cardUrl?: string | null;
}): Promise<CheckinProofStats> {
  const checkin_stats = honorCardStatsPayload({
    fields: input.card.fields,
    laneId: input.laneId,
    laneLabel: input.card.laneLabel,
    title: input.card.title,
    periodLabel: input.card.periodLabel,
    cardUrl: input.cardUrl ?? input.existingStats?.card_url ?? null,
  });
  const patch = await supabase.from('posts').update({ checkin_stats }).eq('id', input.postId);
  if (patch.error) {
    throw new Error(patch.error.message);
  }
  return checkin_stats;
}
