import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';

import { AppText } from '@/components/ui/AppText';
import {
  challengeTypeIconKey,
  challengeTypeIconLabel,
  challengeTypeIconSource,
  challengeTypeIconTint,
} from '@/lib/challengeTypeIcon';
import { THEME } from '@/lib/theme';

const BADGE = 26;
const TIP_MS = 2200;

export function ChallengeTypePlaceholder({
  category,
  onPress,
}: {
  category?: string | null;
  onPress: () => void;
}) {
  const label = challengeTypeIconLabel(category);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: challengeTypeIconTint(category),
      }}>
      <Image
        source={challengeTypeIconSource(category)}
        style={{ width: '88%', height: '88%', backgroundColor: 'transparent' }}
        contentFit="contain"
        contentPosition="center"
        recyclingKey={challengeTypeIconKey(category)}
        accessibilityLabel={label}
      />
    </Pressable>
  );
}

export function ChallengeTypeBadge({
  category,
  onPress,
}: {
  category?: string | null;
  onPress: () => void;
}) {
  const label = challengeTypeIconLabel(category);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      style={{
        position: 'absolute',
        left: 5,
        bottom: 5,
        zIndex: 4,
        width: BADGE,
        height: BADGE,
        backgroundColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Image
        source={challengeTypeIconSource(category)}
        style={{ width: BADGE, height: BADGE, backgroundColor: 'transparent' }}
        contentFit="contain"
        recyclingKey={challengeTypeIconKey(category)}
      />
    </Pressable>
  );
}

export function ChallengeTypeTip({
  category,
  visible,
  anchor = 'badge',
}: {
  category?: string | null;
  visible: boolean;
  anchor?: 'badge' | 'panel';
}) {
  if (!visible) {
    return null;
  }
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: anchor === 'badge' ? 6 : 8,
        right: anchor === 'panel' ? 8 : undefined,
        bottom: anchor === 'badge' ? BADGE + 10 : 10,
        zIndex: 5,
        alignItems: anchor === 'panel' ? 'center' : 'flex-start',
      }}>
      <View
        style={{
          backgroundColor: 'rgba(16, 19, 18, 0.88)',
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 8,
        }}>
        <AppText
          style={{
            color: THEME.primaryForeground,
            fontSize: 12,
            fontWeight: '700',
          }}>
          {challengeTypeIconLabel(category)}
        </AppText>
      </View>
    </View>
  );
}

export function useChallengeTypeTip() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handle = setTimeout(() => setOpen(false), TIP_MS);
    return () => clearTimeout(handle);
  }, [open]);

  return {
    open,
    show: () => setOpen(true),
    hide: () => setOpen(false),
  };
}
