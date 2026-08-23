import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { authStorage } from '@/lib/utils/secureStore';

/**
 * Official pitch (Bob “A small promise…”):
 * - Not now = this session only (`skippedThisSession` in OfficialPitchHost).
 * - Do not show again = persist `official_pitch_dismissed_challenge_id` until a
 *   new Official filling instance is advertised (new challenge id).
 */
export const OFFICIAL_PITCH_DISMISSED_KEY = 'official_pitch_dismissed_challenge_id';

export function officialPitchStorageKey(userId: string): string {
  return `${OFFICIAL_PITCH_DISMISSED_KEY}:${userId}`;
}

export function officialPitchSuppressed(
  advertisedId: string | null | undefined,
  dismissedId: string | null | undefined,
): boolean {
  return Boolean(advertisedId && dismissedId && advertisedId === dismissedId);
}

export async function readOfficialPitchDismissedId(userId: string): Promise<string | null> {
  const raw = await authStorage.getItem(officialPitchStorageKey(userId));
  const value = raw?.trim() ?? '';
  return value || null;
}

export async function persistOfficialPitchDismissed(
  userId: string,
  challengeId: string,
): Promise<void> {
  const id = challengeId.trim();
  if (!id) {
    return;
  }
  await authStorage.setItem(officialPitchStorageKey(userId), id);
  const rpc = await supabase.rpc('set_official_pitch_dismissed', { p_challenge_id: id });
  if (rpc.error) {
    await supabase
      .from('profiles')
      .update({ official_pitch_dismissed_challenge_id: id } as never)
      .eq('id', userId);
  }
  queryClient.setQueriesData({ queryKey: ['profile'] }, (current) => {
    if (!current || typeof current !== 'object') {
      return current;
    }
    return { ...current, official_pitch_dismissed_challenge_id: id };
  });
}
