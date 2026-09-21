import { Image } from 'expo-image';
import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';

const MEDALS = {
  1: require('@/assets/leaderboard/medal-gold.png'),
  2: require('@/assets/leaderboard/medal-silver.png'),
  3: require('@/assets/leaderboard/medal-bronze.png'),
} as const;

export function RankMedal({
  rank,
  size = 46,
  muted = false,
}: {
  rank: number | string | null;
  size?: number;
  muted?: boolean;
}) {
  const n = typeof rank === 'number' ? rank : Number(rank);
  const source = n === 1 || n === 2 || n === 3 ? MEDALS[n] : null;
  const ink = muted ? THEME.textMuted : THEME.textPrimary;

  if (source) {
    return (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Rank ${n}`}
        style={{
          width: size,
          height: size,
          overflow: 'visible',
          backgroundColor: 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Image
          source={source}
          style={{ width: size, height: size, backgroundColor: 'transparent' }}
          contentFit="contain"
          accessibilityElementsHidden
        />
      </View>
    );
  }

  const text = rank == null || rank === '' ? '—' : String(rank);
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={text === '—' ? 'Unranked' : `Rank ${text}`}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <AppText
        className="text-center text-[13px] font-extrabold"
        style={{ color: ink, fontVariant: ['tabular-nums'] }}>
        {text}
      </AppText>
    </View>
  );
}
