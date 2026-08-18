import { evaluateBadges, type NewBadge } from '@/lib/badges';
import { queryClient } from '@/lib/queryClient';

type UnlockListener = (awarded: NewBadge[]) => void;

let listener: UnlockListener | null = null;
let pending: Promise<NewBadge[]> | null = null;

export function setBadgeUnlockListener(next: UnlockListener | null) {
  listener = next;
}

export async function reportBadgeActivity(): Promise<NewBadge[]> {
  if (pending) {
    return pending;
  }
  pending = (async () => {
    try {
      const awarded = await evaluateBadges();
      if (awarded.length === 0) {
        return [];
      }
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
      void queryClient.invalidateQueries({ queryKey: ['badges'] });
      listener?.(awarded);
      return awarded;
    } catch (error) {
      console.warn('[blob:badges]', error instanceof Error ? error.message : error);
      return [];
    } finally {
      pending = null;
    }
  })();
  return pending;
}
