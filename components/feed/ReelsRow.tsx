import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, type Href } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { useReels } from '@/hooks/useSocial';
import { copy } from '@/lib/copy';
import { CAPTURE_REEL_HREF, reelHref } from '@/lib/routes';
import { personDisplayName } from '@/lib/social';
import { themeShadow } from '@/lib/theme';
import type { PublicProfile } from '@/lib/types';

/** Row component name stays ReelsRow; user-facing title is Rounds. Capture URL stays mode=reel. */

type MomentVariant = 'teal' | 'dark' | 'soft';

type MomentItem = {
  id: string;
  handle: string;
  title: string;
  variant: MomentVariant;
  href: Href;
  thumbUrl?: string | null;
};

const VARIANTS: MomentVariant[] = ['teal', 'dark', 'dark', 'soft'];

const GRADIENTS: Record<MomentVariant, readonly [string, string]> = {
  teal: ['#2F9C8A', '#73DDCE'],
  dark: ['#151817', '#242925'],
  soft: ['#DFF6F2', '#7DDDCF'],
};

function reelHandle(profile?: PublicProfile | null): string {
  const username = profile?.username?.trim();
  if (username) {
    return `@${username.replace(/^@/, '')}`;
  }
  return personDisplayName(profile);
}

export function ReelsRow() {
  const router = useRouter();
  const reels = useReels(8);
  const liveReels = (reels.data ?? []).slice(0, 8).map((reel, index) => ({
    id: reel.id,
    handle: reelHandle(reel.profile),
    title: reel.caption?.trim() || copy('round.fallback'),
    variant: VARIANTS[index % VARIANTS.length],
    href: reelHref(reel.id),
    thumbUrl: reel.thumbnail_url?.trim() || null,
  }));
  const createCard: MomentItem = {
    id: 'new-reel',
    handle: 'You',
    title: copy('round.new'),
    variant: 'teal',
    href: CAPTURE_REEL_HREF,
  };
  const cards = [createCard, ...liveReels];

  return (
    <View className="gap-2" style={{ marginHorizontal: -16 }}>
      <AppText className="px-4 text-[13px] font-bold text-muted">{copy('round.title')}</AppText>
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
      {liveReels.length === 0 ? (
        <AppText className="px-4 text-[12px] text-muted">{copy('round.empty')}</AppText>
      ) : null}
    </View>
  );
}

function MomentCard({
  item,
  onPress,
}: {
  item: MomentItem;
  onPress: () => void;
}) {
  const light = item.variant === 'soft' && !item.thumbUrl;
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
        {item.thumbUrl ? (
          <Image
            source={{ uri: item.thumbUrl }}
            contentFit="cover"
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
          />
        ) : null}
        {item.thumbUrl ? (
          <LinearGradient
            colors={['rgba(16,19,18,0.15)', 'rgba(16,19,18,0.55)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
          />
        ) : (
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
        )}
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
