import { useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { BlobMascot } from '@/components/mascot/BlobMascot';
import { TourAnchor } from '@/components/tour/TourAnchor';
import { Button } from '@/components/ui/Button';
import { AppText } from '@/components/ui/AppText';
import { officialBob } from '@/copy/officialBob';
import { useAuth } from '@/hooks/useAuth';
import { fetchOfficialDiscoverChallenges } from '@/lib/challenges';
import { OFFICIAL_ACTIVE_STATUSES } from '@/lib/officialSeries';
import { challengeDetailHref, LOBBY_HREF } from '@/lib/routes';
import { supabase } from '@/lib/supabase';

const LIVE_JOIN = ['joined', 'active', 'completed'] as const;

let skippedThisSession = false;

export function OfficialPitchHost() {
  const { user } = useAuth();
  const router = useRouter();
  const [skipped, setSkipped] = useState(skippedThisSession);
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
    enabled: Boolean(user?.id) && !skipped && inOfficial.data === false,
    queryFn: () => fetchOfficialDiscoverChallenges(user?.id),
  });

  if (skipped || !user || inOfficial.isLoading || inOfficial.data) {
    return null;
  }

  function dismiss() {
    skippedThisSession = true;
    setSkipped(true);
  }

  return (
    <TourAnchor id="tour-official">
    <View>
      <View className="items-center pt-2">
        <BlobMascot variant="wave" size={180} motion="float" />
      </View>
      <AppText className="mt-6 text-2xl font-extrabold text-charcoal">
        {officialBob('loginHeadline')}
      </AppText>
      <AppText className="mt-3 text-[15px] leading-6 text-muted">
        {officialBob('loginBody')}
      </AppText>
      <View className="mt-6 gap-3">
        <Button
          title={officialBob('loginCta')}
          size="lg"
          onPress={() => {
            dismiss();
            const filling = joinable.data?.[0];
            if (filling?.id) {
              router.push(challengeDetailHref(filling.id, 'feed'));
              return;
            }
            router.push(LOBBY_HREF);
          }}
        />
        <Button title={officialBob('loginSkip')} variant="ghost" onPress={dismiss} />
      </View>
    </View>
    </TourAnchor>
  );
}
