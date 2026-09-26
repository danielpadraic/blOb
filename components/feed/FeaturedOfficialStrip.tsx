import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter } from 'expo-router';

import { TourAnchor } from '@/components/tour/TourAnchor';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import { pushChallengeHref } from '@/lib/challengeNav';
import { officialDobStatus } from '@/lib/officialDob';
import {
  CASH_OFFICIAL_BANNER,
  cashOfficialBannerHelper,
  cashOfficialGate,
} from '@/lib/officialCash';
import { OFFICIAL_ACTIVE_STATUSES } from '@/lib/officialSeries';
import { challengeDetailHref, LOBBY_HREF } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { THEME } from '@/lib/theme';

const BLOB_WORDMARK = require('@/assets/mascot/blob-logo.png');
const BAR = '#123832';

/** The live cash Official ladder row, if the house has one open. */
function useCashOfficialTarget(enabled: boolean) {
  return useQuery({
    queryKey: ['cash-official-banner'],
    enabled,
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('challenges')
        .select('id, starts_at')
        .eq('is_official', true)
        .eq('currency', 'bucks')
        .not('series_id', 'is', null)
        .in('status', [...OFFICIAL_ACTIVE_STATUSES])
        .order('starts_at', { ascending: true })
        .limit(1);
      if (error) {
        return null;
      }
      return data?.[0]?.id ? String(data[0].id) : null;
    },
  });
}

/**
 * Home hero. Advertises the house cash ladder — weekly $1, monthly $10.
 * View only: this banner never starts a charge. Official Coin stays the free
 * home base on the Live rail below.
 */
export function FeaturedOfficialStrip() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const target = useCashOfficialTarget(Boolean(user));

  const gate = cashOfficialGate({
    dobStatus: officialDobStatus(profile?.date_of_birth),
    declaredRegion: profile?.declared_region,
  });
  const helper = cashOfficialBannerHelper(gate);

  if (!user) {
    return null;
  }

  function onView() {
    const id = target.data;
    if (id) {
      pushChallengeHref(
        router,
        String(challengeDetailHref(id, 'lobby', null, { tab: 'overview' })),
        'home-official',
        id,
        pathname,
      );
      return;
    }
    // No open cash row today. The Official lobby is the standing pitch.
    router.push(LOBBY_HREF);
  }

  return (
    <TourAnchor id="tour-official-banner">
    <TourAnchor id="tour-official">
      <View
        style={{
          minHeight: 58,
          borderRadius: 18,
          overflow: 'hidden',
          backgroundColor: BAR,
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 8,
          paddingRight: 8,
          paddingLeft: 10,
        }}>
        <View
          style={{
            flex: 1,
            minWidth: 0,
            flexDirection: 'row',
            alignItems: 'center',
          }}>
        <View
          style={{
            width: 3,
            alignSelf: 'stretch',
            marginVertical: 6,
            marginRight: 8,
            borderRadius: 2,
            backgroundColor: THEME.accent,
          }}
        />
        <Image
          source={BLOB_WORDMARK}
          style={{ width: 56, height: 22, backgroundColor: 'transparent' }}
          contentFit="contain"
          tintColor="#F7FFFC"
          accessibilityLabel="blOb"
        />
        <View className="min-w-0 flex-1" style={{ paddingHorizontal: 10 }}>
          <AppText
            className="text-[16px] font-extrabold"
            numberOfLines={1}
            style={{ color: '#FFFFFF' }}>
            {CASH_OFFICIAL_BANNER.title}
          </AppText>
          {helper ? (
            <AppText
              className="mt-0.5 text-[12px] font-semibold"
              numberOfLines={1}
              style={{ color: 'rgba(231, 247, 243, 0.72)' }}>
              {helper}
            </AppText>
          ) : null}
        </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={CASH_OFFICIAL_BANNER.cta}
          onPress={onView}
          style={{
            minHeight: 36,
            paddingHorizontal: 14,
            borderRadius: 999,
            backgroundColor: THEME.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <AppText
            className="text-[13px] font-extrabold"
            style={{ color: THEME.accentForeground }}>
            {CASH_OFFICIAL_BANNER.cta}
          </AppText>
        </Pressable>
      </View>
    </TourAnchor>
    </TourAnchor>
  );
}
