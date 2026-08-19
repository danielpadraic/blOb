import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import { AppText } from '@/components/ui/AppText';
import { supabase } from '@/lib/supabase';
import { THEME } from '@/lib/theme';
import { isMissingRelationError } from '@/utils/errors';

const STREAK_LABELS: Record<string, string> = {
  streak_3: '3-day streak',
  streak_7: '7-day streak',
  streak_30: '30-day streak',
};

export function StreakBadgesRow({ userId }: { userId: string }) {
  const badges = useQuery({
    queryKey: ['user-badges', userId, 'streaks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_badges')
        .select('badge_key')
        .eq('user_id', userId)
        .in('badge_key', ['streak_3', 'streak_7', 'streak_30']);
      if (error) {
        if (isMissingRelationError(error)) {
          return [];
        }
        throw error;
      }
      return data ?? [];
    },
    staleTime: 30_000,
  });
  const streaks = (badges.data ?? []).filter((row) => STREAK_LABELS[row.badge_key]);
  if (streaks.length === 0) {
    return null;
  }

  return (
    <View
      className="px-4 py-3"
      style={{
        backgroundColor: THEME.surface,
        borderRadius: THEME.radius,
        borderWidth: 1,
        borderColor: THEME.border,
      }}>
      <AppText className="text-[12px] font-bold uppercase tracking-widest text-charcoal">
        Streaks
      </AppText>
      <AppText className="mt-1 text-[13px] leading-5 text-muted">
        {streaks.map((row) => STREAK_LABELS[row.badge_key]).join(' · ')}
      </AppText>
    </View>
  );
}
