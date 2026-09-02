import { useEffect } from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';

import { THEME } from '@/lib/theme';
import type { InterestRoomSlug } from '@/lib/interestsCatalog';

const BOB = require('@/assets/login/blob-login.png');

/** Existing tokens only. Video files land later; this is never a camera stream. */
const ROOM_GRADIENT: Record<InterestRoomSlug, readonly [string, string]> = {
  health_fitness: [THEME.secondaryDark, THEME.accent],
  sports: [THEME.primary, THEME.secondaryDark],
  personal_development: [THEME.secondaryDark, THEME.primary],
  relationships: [THEME.circle, THEME.secondaryDark],
  esports: [THEME.primary, THEME.secondaryDark],
  outdoors: [THEME.accent, THEME.secondaryDark],
};

type BackdropSlotProps = {
  roomSlug?: InterestRoomSlug | null;
  playing?: boolean;
  children: React.ReactNode;
};

export function BackdropSlot({ roomSlug, playing = true, children }: BackdropSlotProps) {
  const pair = roomSlug ? ROOM_GRADIENT[roomSlug] : ([THEME.secondaryDark, THEME.primary] as const);

  useEffect(() => {
    return () => {
      // File loops (later) pause here. Never open getUserMedia for this slot.
    };
  }, [roomSlug, playing]);

  return (
    <View style={{ flex: 1, minHeight: 0, backgroundColor: THEME.primary }}>
      <LinearGradient
        colors={[pair[0], pair[1]]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: 'rgba(16, 19, 18, 0.55)',
        }}
      />
      <View
        pointerEvents="none"
        style={{ position: 'absolute', right: 12, bottom: 96, opacity: 0.22 }}>
        <Image source={BOB} style={{ width: 120, height: 120 }} contentFit="contain" />
      </View>
      {children}
    </View>
  );
}
