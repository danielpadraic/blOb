import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { usePathname, useRouter } from 'expo-router';

import { useTeacherBeginOptional } from '@/components/teacher/TeacherBeginHost';
import { TourAnchor } from '@/components/tour/TourAnchor';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import { useTeacher3DayState } from '@/hooks/useTeacher3Day';
import { pushCheckinSubmit } from '@/lib/challengeNav';
import { officialDobStatus } from '@/lib/officialDob';
import {
  TEACHER_PRIZE_CHIP,
  emptyTeacher3DayState,
  teacherBannerCta,
  teacherBannerHelper,
  teacherBannerTitle,
} from '@/lib/teacher3day';
import { THEME } from '@/lib/theme';

const BLOB_WORDMARK = require('@/assets/mascot/blob-logo.png');
const BAR = '#123832';

export function FeaturedOfficialStrip() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const teacher = useTeacher3DayState();
  const beginHost = useTeacherBeginOptional();
  const state = teacher.data ?? emptyTeacher3DayState();
  const underage = officialDobStatus(profile?.date_of_birth) === 'underage';
  const title = teacherBannerTitle(state);
  const cta = teacherBannerCta(state);
  const helper = teacherBannerHelper(state, underage);
  const done = state.phase === 'done';
  const disabled = underage || (done && true);

  if (!user) {
    return null;
  }

  function onCta() {
    if (underage) {
      return;
    }
    if (state.phase === 'live' && state.challengeId) {
      pushCheckinSubmit(router, state.challengeId, 'home-official', undefined, pathname);
      return;
    }
    if (state.phase === 'missed') {
      beginHost?.openRestart();
      return;
    }
    if (state.phase === 'done') {
      return;
    }
    beginHost?.openBegin();
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
            {title}
          </AppText>
          {helper ? (
            <AppText
              className="mt-0.5 text-[12px] font-semibold"
              numberOfLines={1}
              style={{ color: 'rgba(231, 247, 243, 0.72)' }}>
              {helper}
            </AppText>
          ) : done ? (
            <AppText
              className="mt-0.5 text-[12px] font-semibold"
              numberOfLines={1}
              style={{ color: THEME.accentBright }}>
              {TEACHER_PRIZE_CHIP}
            </AppText>
          ) : null}
        </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={cta}
          disabled={disabled || (state.phase === 'live' && !state.challengeId)}
          onPress={onCta}
          style={{
            minHeight: 36,
            paddingHorizontal: 14,
            borderRadius: 999,
            backgroundColor: done || underage ? 'rgba(231, 247, 243, 0.18)' : THEME.accent,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: disabled && !done ? 0.38 : 1,
          }}>
          <AppText
            className="text-[13px] font-extrabold"
            style={{ color: done || underage ? '#F7FFFC' : THEME.accentForeground }}>
            {cta}
          </AppText>
        </Pressable>
      </View>
    </TourAnchor>
    </TourAnchor>
  );
}
