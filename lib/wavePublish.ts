import { sessionAuthor, type LiveAuthorLike } from '@/lib/safeIds';
import { getErrorMessage } from '@/utils/errors';

export type WavePublishStage = 'tag' | 'insert' | 'navigate' | 'player';

export const WAVE_TAG_SOFT_FAIL = 'Posted without the tag.';

/** One line. No file bytes. No tokens. */
export function logWaveFail(stage: WavePublishStage, error?: unknown): void {
  const message = getErrorMessage(error).trim() || 'fail';
  console.log('[blob:wave]', { stage, message: message.slice(0, 180) });
}

/** Always an author object with id before Wave navigate. Never throw. */
export function waveSessionAuthor(
  profile?: LiveAuthorLike,
  userId?: string | null,
): { id: string; username: string; display_name: string | null; avatar_url: string | null } | null {
  try {
    return sessionAuthor(profile, userId);
  } catch (error) {
    logWaveFail('insert', error);
    const id = String(userId ?? '').trim();
    if (!id) {
      return null;
    }
    return {
      id,
      username: 'blob',
      display_name: null,
      avatar_url: null,
    };
  }
}
