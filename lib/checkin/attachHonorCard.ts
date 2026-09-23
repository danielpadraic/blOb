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
import { uploadPostAttachment } from '@/utils/upload';

const RASTER_MS = 8000;

export async function writeHonorCheckinCard(input: {
  userId: string;
  postId: string;
  card: HonorCardModel;
  laneId?: string | null;
  existingMedia?: string[] | null;
  existingStats?: CheckinProofStats | null;
}): Promise<{ media_urls: string[]; checkin_stats: CheckinProofStats }> {
  try {
    const fileUri = await Promise.race([
      rasterHonorProofCard(input.card),
      new Promise<string>((_, reject) => {
        setTimeout(() => reject(new Error('timeout')), RASTER_MS);
      }),
    ]);
    return persistHonorCardOnPost({
      userId: input.userId,
      postId: input.postId,
      fileUri,
      card: input.card,
      laneId: input.laneId,
      existingMedia: input.existingMedia,
      existingStats: input.existingStats,
    });
  } catch {
    const checkin_stats = await persistHonorStatsOnPost({
      postId: input.postId,
      card: input.card,
      laneId: input.laneId,
      existingStats: input.existingStats,
    });
    return {
      media_urls: uniqueProofUrls(input.existingMedia),
      checkin_stats,
    };
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
