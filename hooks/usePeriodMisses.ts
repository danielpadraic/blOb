import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

function isMissingRelation(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes('does not exist') ||
    text.includes('schema cache') ||
    text.includes('42p01') ||
    text.includes('42703')
  );
}

export async function fetchViewerPeriodMissCount(
  challengeId: string,
  userId: string,
): Promise<number> {
  const result = await (
    supabase as unknown as {
      from: (table: string) => {
        select: (
          columns: string,
          opts: { count: 'exact'; head: boolean },
        ) => {
          eq: (col: string, val: string) => {
            eq: (
              col: string,
              val: string,
            ) => Promise<{ count: number | null; error: { message: string } | null }>;
          };
        };
      };
    }
  )
    .from('challenge_period_misses')
    .select('period_key', { count: 'exact', head: true })
    .eq('challenge_id', challengeId)
    .eq('user_id', userId);
  if (result.error) {
    if (isMissingRelation(result.error.message)) {
      return 0;
    }
    throw result.error;
  }
  return Math.max(result.count ?? 0, 0);
}

export function useViewerPeriodMisses(challengeId?: string, enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['period-misses', challengeId, user?.id],
    enabled: Boolean(challengeId && user?.id && enabled),
    queryFn: () => fetchViewerPeriodMissCount(challengeId!, user!.id),
  });
}
