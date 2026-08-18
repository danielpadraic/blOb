import { Pressable, ScrollView, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, type Href } from 'expo-router';

import { AppText } from '@/components/ui/AppText';
import { useChallenges } from '@/hooks/useChallenge';
import { useReels } from '@/hooks/useSocial';
import { CAPTURE_REEL_HREF, challengeDetailHref } from '@/lib/routes';
import { themeShadow } from '@/lib/theme';

type MomentVariant = 'teal' | 'dark' | 'soft';

type MomentItem = {
  id: string;
  handle: string;
  title: string;
  variant: MomentVariant;
  href?: Href;
};

const VARIANTS: MomentVariant[] = ['teal', 'dark', 'dark', 'soft'];

const GRADIENTS: Record<MomentVariant, readonly [string, string]> = {
  teal: ['#2F9C8A', '#73DDCE'],
  dark: ['#151817', '#242925'],
  soft: ['#DFF6F2', '#7DDDCF'],
};

const COMING_SOON: MomentItem = {
  id: 'reels-soon',
  handle: '@blob',
  title: 'Reels coming soon',
  variant: 'soft',
};

export function ReelsRow() {
  const router = useRouter();
  const reels = useReels(8);
  const challenges = useChallenges();
  const liveReels = (reels.data ?? []).slice(0, 8).map((reel, index) => ({
    id: reel.id,
    handle: '@blob',
    title: reel.caption?.trim() || 'Reel',
    variant: VARIANTS[index % VARIANTS.length],
    href: reel.challenge_id ? challengeDetailHref(reel.challenge_id, 'feed') : undefined,
  }));
  const liveChallenges = (challenges.data ?? []).slice(0, 4).map((challenge, index) => ({
    id: challenge.id,
    handle: challenge.is_official ? '@official' : '@blob',
    title: challenge.title,
    variant: VARIANTS[index % VARIANTS.length],
    href: challengeDetailHref(challenge.id, 'feed'),
  }));
  const createCard: MomentItem = {
    id: 'new-reel',
    handle: 'You',
    title: 'New Reel',
    variant: 'teal',
    href: CAPTURE_REEL_HREF,
  };
  const cards = [createCard, ...(liveReels.length > 0 ? liveReels : [COMING_SOON, ...liveChallenges].slice(0, 3))];

  return (
    <View className="gap-2" style={{ marginHorizontal: -16 }}>
      <AppText className="px-4 text-[13px] font-bold text-muted">Reels</AppText>
      <ScrollView
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingBottom: 2 }}>
        {cards.map((item) => (
          <MomentCard
            key={item.id}
            item={item}
            onPress={item.href ? () => router.push(item.href!) : undefined}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function MomentCard({
  item,
  onPress,
}: {
  item: MomentItem;
  onPress?: () => void;
}) {
  const light = item.variant === 'soft';
  const color = light ? '#12332D' : '#FFFFFF';

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
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
