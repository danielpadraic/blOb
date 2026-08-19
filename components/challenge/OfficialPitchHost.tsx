import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSegments } from 'expo-router';

import { BlobMascot } from '@/components/mascot/BlobMascot';
import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { officialBob } from '@/copy/officialBob';
import { useAuth } from '@/hooks/useAuth';
import { fetchOfficialDiscoverChallenges } from '@/lib/challenges';
import { OFFICIAL_ACTIVE_STATUSES } from '@/lib/officialSeries';
import { challengeDetailHref, LOBBY_HREF } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { THEME } from '@/lib/theme';

const LIVE_JOIN = ['joined', 'active', 'completed'] as const;

export function OfficialPitchHost() {
  const { user } = useAuth();
  const router = useRouter();
  const segments = useSegments();
  const [skipped, setSkipped] = useState(false);
  const parts = (segments as string[]).filter((segment) => !segment.startsWith('('));
  const onHome = parts[0] === 'feed' && (!parts[1] || parts[1] === 'index');
  const inOfficial = useQuery({
    queryKey: ['official-participation', user?.id],
    enabled: Boolean(user?.id) && !skipped,
    queryFn: async () => {
      if (!user?.id) {
        return false;
      }
      const { data: rows } = await supabase
        .from('challenge_participants')
        .select('challenge_id, status')
        .eq('user_id', user.id)
        .in('status', [...LIVE_JOIN]);
      const ids = [...new Set((rows ?? []).map((row) => row.challenge_id).filter(Boolean))];
      if (ids.length === 0) {
        return false;
      }
      const { data: challenges } = await supabase
        .from('challenges')
        .select('id, is_official, status, series_id')
        .in('id', ids)
        .eq('is_official', true)
        .in('status', [...OFFICIAL_ACTIVE_STATUSES]);
      return (challenges ?? []).length > 0;
    },
  });
  const joinable = useQuery({
    queryKey: ['official-joinable-cta', user?.id],
    enabled: Boolean(user?.id) && !skipped && onHome && inOfficial.data === false,
    queryFn: () => fetchOfficialDiscoverChallenges(user?.id),
  });

  if (!onHome || skipped || !user || inOfficial.isLoading || inOfficial.data) {
    return null;
  }

  return (
    <ChromeOverlay visible dim={false} align="start">
      <View
        className="flex-1 px-5 pb-8 pt-4"
        style={{ backgroundColor: THEME.background, minHeight: '100%' }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
          <View className="items-center pt-4">
            <BlobMascot variant="wave" size={180} motion="float" />
          </View>
          <AppText className="mt-6 text-2xl font-extrabold text-charcoal">
            {officialBob('loginHeadline')}
          </AppText>
          <AppText className="mt-3 text-[15px] leading-6 text-muted">
            {officialBob('loginBody')}
          </AppText>
          <View className="mt-auto gap-3 pt-8">
            <Button
              title={officialBob('loginCta')}
              size="lg"
              onPress={() => {
                setSkipped(true);
                const filling = joinable.data?.[0];
                if (filling?.id) {
                  router.push(challengeDetailHref(filling.id, 'feed'));
                  return;
                }
                router.push(LOBBY_HREF);
              }}
            />
            <Button
              title={officialBob('loginSkip')}
              variant="ghost"
              onPress={() => setSkipped(true)}
            />
          </View>
        </ScrollView>
      </View>
    </ChromeOverlay>
  );
}
