import { useCallback } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
import { useHomePulse } from '@/hooks/useHomePulse';
import { copy } from '@/lib/copy';
import { pulseChallengeHref, type PulseFace, type PulsePill } from '@/lib/homePulse';
import { THEME, flexChildMin, themeShadow } from '@/lib/theme';

const PILL_WIDTH = 168;
const FACE = 18;

function FacePile({ faces }: { faces: PulseFace[] }) {
  if (faces.length === 0) {
    return null;
  }
  return (
    <View style={{ flexDirection: 'row', flexShrink: 0, width: FACE + (faces.length - 1) * 11 }}>
      {faces.map((face, index) => (
        <View
          key={face.id || `face-${index}`}
          style={{
            marginLeft: index === 0 ? 0 : -7,
            zIndex: faces.length - index,
            borderWidth: 1.5,
            borderColor: THEME.surface,
            borderRadius: FACE / 2,
          }}>
          <Avatar uri={face.avatarUrl} name={face.name} size={FACE} />
        </View>
      ))}
    </View>
  );
}

function PulseChip({ pill }: { pill: PulsePill }) {
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${pill.title}. ${pill.snippet}`}
      onPress={() => router.push(pulseChallengeHref(pill.id))}
      style={{
        width: PILL_WIDTH,
        minHeight: 44,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: THEME.radius,
        backgroundColor: THEME.surface,
        borderWidth: 1,
        borderColor: THEME.border,
        ...themeShadow('card'),
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <AppText
          numberOfLines={1}
          className="text-[13px] font-extrabold text-charcoal"
          style={{ flex: 1, ...flexChildMin() }}>
          {pill.title}
        </AppText>
        <FacePile faces={pill.faces} />
      </View>
      <AppText numberOfLines={1} className="mt-1 text-[12px] text-muted">
        {pill.snippet}
      </AppText>
    </Pressable>
  );
}

/** Home Pulse. Fetches itself so a refresh does not remount the Home composer. */
export function PulseRail() {
  const pulse = useHomePulse();
  const refetchPulse = pulse.refetch;

  useFocusEffect(
    useCallback(() => {
      void refetchPulse();
    }, [refetchPulse]),
  );

  const pills = pulse.data ?? [];
  if (!pulse.isFetched || pulse.isError || pills.length === 0) {
    return null;
  }

  return (
    <View style={{ marginHorizontal: -16 }} accessibilityLabel={copy('pulse.rail')}>
      <ScrollView
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 2 }}>
        {pills.map((pill) => (
          <PulseChip key={pill.id} pill={pill} />
        ))}
      </ScrollView>
    </View>
  );
}
