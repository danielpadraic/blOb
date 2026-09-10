import { fetchBlockedPeerIds } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import { isMissingRelationError, logDev } from '@/utils/errors';

const CACHE_MS = 30_000;

let cache: { userId: string; at: number; ids: Set<string> } | null = null;

async function mutedIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('mutes')
    .select('muted_user_id')
    .eq('user_id', userId);
  if (error) {
    if (!isMissingRelationError(error)) {
      console.log('[blob:moderation] mutes lookup skipped', error.message);
    }
    return [];
  }
  return (data ?? []).map((row) => row.muted_user_id);
}

async function blockedIds(userId: string): Promise<string[]> {
  try {
    return [...(await fetchBlockedPeerIds(userId))];
  } catch (error) {
    if (!isMissingRelationError(error)) {
      logDev('[blob:moderation] blocked lookup skipped', error);
    }
    return [];
  }
}

/**
 * Authors whose words should not reach this viewer: muted or blocked, either
 * direction. Cached briefly because comment hydration asks on every page.
 */
export async function fetchSilencedAuthorIds(userId?: string | null): Promise<Set<string>> {
  if (!userId) {
    return new Set();
  }
  if (cache && cache.userId === userId && Date.now() - cache.at < CACHE_MS) {
    return cache.ids;
  }
  const [muted, blocked] = await Promise.all([mutedIds(userId), blockedIds(userId)]);
  const ids = new Set([...muted, ...blocked]);
  cache = { userId, at: Date.now(), ids };
  return ids;
}

/** Call right after a block, unblock, mute, or unmute so the next read is true. */
export function clearSilencedAuthorCache() {
  cache = null;
}
