import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';

import { AppText } from '@/components/ui/AppText';
import { type ChallengeTagKind, type ChallengeTagSpec } from '@/lib/challengeTags';
import { THEME } from '@/lib/theme';

const ICON = 26;
const COMPACT = 22;
const TIP_MS = 2200;

const TAG_ICONS: Record<ChallengeTagKind, number> = {
  official: require('@/assets/challenge-tags/official.png'),
  public: require('@/assets/challenge-tags/public.png'),
  private: require('@/assets/challenge-tags/private.png'),
  joined: require('@/assets/challenge-tags/joined.png'),
  notJoined: require('@/assets/challenge-tags/not_joined.png'),
  live: require('@/assets/challenge-tags/live.png'),
  notStarted: require('@/assets/challenge-tags/not_started.png'),
  consistency: require('@/assets/challenge-tags/consistency.png'),
  points: require('@/assets/challenge-tags/points.png'),
};

type ChallengeTagProps = {
  kind: ChallengeTagKind;
  label: string;
  size?: number;
  active?: boolean;
  onPress: () => void;
};

export function ChallengeTag({ kind, label, size = ICON, active, onPress }: ChallengeTagProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: Boolean(active) }}
      hitSlop={6}
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      style={{
        width: size,
        height: size,
        backgroundColor: 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Image
        source={TAG_ICONS[kind]}
        style={{ width: size, height: size, backgroundColor: 'transparent' }}
        contentFit="contain"
        recyclingKey={kind}
      />
    </Pressable>
  );
}

export function ChallengeTagRow({
  tags,
  tone: _tone = 'light',
  compact = false,
}: {
  tags: ChallengeTagSpec[];
  tone?: 'light' | 'dark';
  compact?: boolean;
}) {
  const [tip, setTip] = useState<string | null>(null);
  const size = compact ? COMPACT : ICON;

  useEffect(() => {
    if (!tip) {
      return;
    }
    const handle = setTimeout(() => setTip(null), TIP_MS);
    return () => clearTimeout(handle);
  }, [tip]);

  if (tags.length === 0) {
    return null;
  }

  return (
    <View style={{ position: 'relative', zIndex: 6 }}>
      <View className="flex-row flex-wrap items-center" style={{ gap: 8 }}>
        {tags.map((tag) => (
          <ChallengeTag
            key={tag.kind}
            kind={tag.kind}
            label={tag.label}
            size={size}
            active={tip === tag.label}
            onPress={() => setTip(tag.label)}
          />
        ))}
      </View>
      {tip ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: size + 4,
            left: 0,
            zIndex: 8,
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
              {tip}
            </AppText>
          </View>
        </View>
      ) : null}
    </View>
  );
}
