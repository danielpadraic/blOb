import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { authStorage } from '@/lib/utils/secureStore';

export const INTERESTS_NUDGE_KEY = 'interests_nudge_at';

export function interestsNudgeStorageKey(userId: string): string {
  return `${INTERESTS_NUDGE_KEY}:${userId}`;
}

export async function readInterestsNudgeAt(userId: string): Promise<string | null> {
  const raw = await authStorage.getItem(interestsNudgeStorageKey(userId));
  const value = raw?.trim() ?? '';
  return value || null;
}

export async function persistInterestsNudgeAt(userId: string, at = new Date().toISOString()): Promise<string> {
  await authStorage.setItem(interestsNudgeStorageKey(userId), at);
  const { error } = await supabase.from('profiles').update({ interests_nudge_at: at } as never).eq('id', userId);
  void error;
  queryClient.setQueriesData({ queryKey: ['profile'] }, (current) => {
    if (!current || typeof current !== 'object') {
      return current;
    }
    return { ...current, interests_nudge_at: at };
  });
  return at;
}
