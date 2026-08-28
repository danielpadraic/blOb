import { useEffect } from 'react';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, type Href } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { useAuth } from '@/hooks/useAuth';
import { useReels } from '@/hooks/useSocial';
import { useVideoPoster } from '@/hooks/useVideoPoster';
import { roundRailLabel } from '@/lib/clipWatch';
import { copy } from '@/lib/copy';
import { CAPTURE_REEL_HREF, reelHref } from '@/lib/routes';
import { persistReelThumbnail } from '@/lib/social';
import { persistGeneratedPoster } from '@/lib/videoPoster';
import { THEME, themeShadow } from '@/lib/theme';
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
  videoUrl?: string | null;
  ownerId?: string | null;
  postId?: string | null;
  caption?: string | null;
  challengeId?: string | null;
};

const VARIANTS: MomentVariant[] = ['teal', 'dark', 'dark', 'soft'];

const GRADIENTS: Record<MomentVariant, readonly [string, string]> = {
  teal: ['#2F9C8A', '#73DDCE'],
  dark: ['#151817', '#242925'],
  soft: ['#DFF6F2', '#7DDDCF'],
};

function reelHandle(profile?: PublicProfile | null): string {
  return roundRailLabel(profile);
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
    videoUrl: reel.video_url,
    ownerId: reel.user_id,
    postId: reel.post_id,
    caption: reel.caption,
    challengeId: reel.challenge_id,
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
    <View className="gap-1.5" style={{ marginHorizontal: -16 }}>
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
            onPress={() => router.push(item.href)}
          />
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
  const { user } = useAuth();
  const generated = useVideoPoster(item.videoUrl, item.thumbUrl);
  const thumbUrl = item.thumbUrl || generated;
  const hasStill = Boolean(thumbUrl) || Boolean(item.videoUrl);
  const light = item.variant === 'soft' && !hasStill;
  const color = light ? '#12332D' : '#FFFFFF';

  useEffect(() => {
    if (!item.videoUrl || item.thumbUrl || !generated || !user?.id || item.ownerId !== user.id) {
      return;
    }
    void persistGeneratedPoster({
      id: item.id,
      videoUrl: item.videoUrl,
      localUri: generated,
      userId: user.id,
      kind: 'reel',
    }).then((url) => {
      if (url) {
        void persistReelThumbnail(item.id, url);
      }
    });
  }, [generated, item.id, item.ownerId, item.thumbUrl, item.videoUrl, user?.id]);

  return (
    <View>
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${item.title} ${item.handle}`}
      style={{ minWidth: 44, minHeight: 44, ...themeShadow('card') }}>
      <LinearGradient
        colors={hasStill ? [THEME.primary, THEME.primary] : [...GRADIENTS[item.variant]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          width: 112,
          height: 128,
          borderRadius: 18,
          overflow: 'hidden',
        }}>
        {thumbUrl ? (
          <Image
            source={{ uri: thumbUrl }}
            contentFit="cover"
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
          />
        ) : null}
        {hasStill ? (
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
        {hasStill ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <Glyph name={GLYPH.play} color="#FFFFFF" size={22} />
          </View>
        ) : null}
        {item.id === 'new-reel' ? null : (
          <AppText
            className="font-bold"
            style={{
              position: 'absolute',
              top: 6,
              left: 6,
              right: 8,
              fontSize: 9,
              lineHeight: 11,
              color,
              zIndex: 2,
            }}
            numberOfLines={1}
            ellipsizeMode="tail">
            {item.handle}
          </AppText>
        )}
      </LinearGradient>
    </Pressable>
    </View>
  );
}
