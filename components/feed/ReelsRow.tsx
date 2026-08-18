import { Pressable, ScrollView, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, type Href } from 'expo-router';

import { AppText } from '@/components/ui/AppText';
import { useChallenges } from '@/hooks/useChallenge';
import { challengeDetailHref } from '@/lib/routes';
import { THEME, themeShadow } from '@/lib/theme';

type MomentVariant = 'teal' | 'dark' | 'soft';

type MomentItem = {
  id: string;
  handle: string;
  title: string;
  variant: MomentVariant;
  href: Href;
};

const VARIANTS: MomentVariant[] = ['teal', 'dark', 'dark', 'soft'];

const GRADIENTS: Record<MomentVariant, readonly [string, string]> = {
  teal: ['#2F9C8A', '#73DDCE'],
  dark: ['#151817', '#242925'],
  soft: ['#DFF6F2', '#7DDDCF'],
};

const DEMO_MOMENTS: MomentItem[] = [
  { id: 'demo-weekly', handle: '@blob', title: 'Official weekly', variant: 'teal', href: '/challenges' },
  { id: 'demo-streak', handle: '@you', title: 'Log streak', variant: 'dark', href: '/challenges' },
  { id: 'demo-lobby', handle: '@lobby', title: 'Open lobby', variant: 'dark', href: '/challenges' },
  { id: 'demo-join', handle: '@crew', title: 'Join a crew', variant: 'soft', href: '/challenges' },
];

export function ReelsRow() {
  const router = useRouter();
  const challenges = useChallenges();
  const live = (challenges.data ?? []).slice(0, 4).map((challenge, index) => ({
    id: challenge.id,
    handle: challenge.is_official ? '@official' : '@blob',
    title: challenge.title,
    variant: VARIANTS[index % VARIANTS.length],
    href: challengeDetailHref(challenge.id, 'feed'),
  }));
  const cards = live.length > 0 ? padMoments(live) : DEMO_MOMENTS;

  return (
    <View style={{ marginHorizontal: -16 }}>
      <ScrollView
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingBottom: 2 }}>
        {cards.map((item) => (
          <MomentCard key={item.id} item={item} onPress={() => router.push(item.href)} />
        ))}
      </ScrollView>
    </View>
  );
}

function padMoments(live: MomentItem[]) {
  if (live.length >= 4) {
    return live;
  }
  const used = new Set(live.map((item) => item.id));
  return [...live, ...DEMO_MOMENTS.filter((item) => !used.has(item.id))].slice(0, 4);
}

function MomentCard({
  item,
  onPress,
}: {
  item: MomentItem;
  onPress: () => void;
}) {
  const light = item.variant === 'soft';
  const color = light ? '#12332D' : '#FFFFFF';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.title} ${item.handle}`}
      style={{ ...themeShadow('card') }}>
      <LinearGradient
        colors={[...GRADIENTS[item.variant]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: 112,
          height: 128,
          borderRadius: 18,
          padding: 12,
          justifyContent: 'space-between',
          overflow: 'hidden',
        }}>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: 'rgba(255,255,255,0.12)',
            right: -20,
            bottom: -22,
          }}
        />
        <AppText className="text-[11px] font-bold" style={{ color, opacity: 0.9 }}>
          {item.handle}
        </AppText>
        <AppText
          className="text-[16px] font-extrabold"
          style={{ color, letterSpacing: -0.3, lineHeight: 18 }}
          numberOfLines={3}>
          {item.title}
        </AppText>
      </LinearGradient>
    </Pressable>
  );
}
