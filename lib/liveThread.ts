import { format } from 'date-fns';

import { isCheckinCompleteStage, isCheckinPost, type CheckinPostLike } from '@/lib/checkinPost';
import { commentMediaUrls, commentTextWithoutMedia } from '@/utils/media';

export const LIVE_CHIP_STARTING = 'Starting';
export const LIVE_CHIP_DONE = 'Done';

export type LivePostLike = CheckinPostLike & {
  id?: string | null;
  created_at?: string | null;
  deleted_at?: string | null;
};

/** Oldest first so the live edge is the bottom of the thread. */
export function sortLivePosts<T extends LivePostLike>(posts: T[]): T[] {
  return [...posts]
    .filter((post) => Boolean(post?.id) && !post.deleted_at)
    .sort((a, b) => {
      const left = new Date(a.created_at ?? 0).getTime();
      const right = new Date(b.created_at ?? 0).getTime();
      if (left !== right) {
        return left - right;
      }
      return String(a.id).localeCompare(String(b.id));
    });
}

/** Clock under a Live bubble: 9:44. */
export function formatLiveClock(date: string | Date | null | undefined): string {
  if (date == null) {
    return '';
  }
  const then = new Date(date);
  if (Number.isNaN(then.getTime())) {
    return '';
  }
  return format(then, 'h:mm');
}

export function liveCheckinLabel(post: CheckinPostLike): 'Check-in' | 'Check-in Complete' {
  return isCheckinCompleteStage(post.checkin_stage) ? 'Check-in Complete' : 'Check-in';
}

export function isLiveCheckinPost(post: CheckinPostLike): boolean {
  return isCheckinPost(post);
}

/** InlineComposer puts photo/GIF URLs on their own lines. Split them for the lobby post. */
export function liveComposeFromInline(content: string): { text: string; mediaUrls: string[] } {
  const trimmed = content.trim();
  if (!trimmed) {
    return { text: '', mediaUrls: [] };
  }
  return {
    text: commentTextWithoutMedia(trimmed).trim(),
    mediaUrls: commentMediaUrls(trimmed),
  };
}
