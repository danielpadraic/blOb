import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import { CurrencyMark } from '@/components/currency/CurrencyMark';
import { AppText } from '@/components/ui/AppText';
import { displayChallengePot } from '@/lib/challengePot';
import { challengeDisplayTitle } from '@/lib/challengeTitle';
import { formatCash, isBucksChallenge } from '@/lib/currency';
import { THEME, themeShadow } from '@/lib/theme';
import type { ChallengeWithStats } from '@/lib/types';

const BOB = require('@/assets/login/blob-login.png');
const COLORS = ['#1B5A50', '#123832', '#0E2421'] as const;
const ADVANCE_MS = 5000;

export function OfficialHomeCarousel({ slides }: { slides: ChallengeWithStats[] }) {
  const router = useRouter();
  const listRef = useRef<FlatList<ChallengeWithStats>>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (slides.length < 2 || width <= 0) {
      return;
    }
    const timer = setInterval(() => {
      setIndex((current) => {
        const next = (current + 1) % slides.length;
        listRef.current?.scrollToOffset({ offset: next * width, animated: true });
        return next;
      });
    }, ADVANCE_MS);
    return () => clearInterval(timer);
  }, [slides.length, width]);

  if (slides.length === 0) {
    return null;
  }

  function onScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    if (width <= 0) {
      return;
    }
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next >= 0 && next < slides.length) {
      setIndex(next);
    }
  }

  return (
    <View
      onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
      style={{ marginBottom: 8, minHeight: 148 }}>
      {width > 0 ? (
      <FlatList
        ref={listRef}
        data={slides}
        horizontal
        pagingEnabled
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        onMomentumScrollEnd={onScrollEnd}
        renderItem={({ item }) => (
          <OfficialBannerSlide
            challenge={item}
            width={width}
            onPress={() => router.push(`/challenges/${item.id}`)}
          />
        )}
      />
      ) : (
        <View style={{ height: 148 }} />
      )}
      {slides.length > 1 ? (
        <View className="flex-row items-center justify-center" style={{ gap: 5, marginTop: 6 }}>
          {slides.map((item, dot) => (
            <View
              key={item.id}
              style={{
                width: dot === index ? 14 : 6,
                height: 6,
                borderRadius: 999,
                backgroundColor: dot === index ? THEME.accent : THEME.border,
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function OfficialBannerSlide({
  challenge,
  width,
  onPress,
}: {
  challenge: ChallengeWithStats;
  width: number;
  onPress: () => void;
}) {
  const title = challengeDisplayTitle(challenge);
  const pot = displayChallengePot(challenge);
  const cover = challenge.cover_image_url?.trim() ?? '';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={{
        width,
        height: 148,
        borderRadius: 20,
        overflow: 'hidden',
        ...themeShadow('card'),
      }}>
      <LinearGradient colors={[...COLORS]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1 }}>
        {cover ? (
          <Image
            source={{ uri: cover }}
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, opacity: 0.28 }}
            contentFit="cover"
            cachePolicy="memory-disk"
            accessibilityLabel={`${title} cover`}
          />
        ) : null}
        <View pointerEvents="none" style={{ position: 'absolute', right: -8, bottom: -10, opacity: 0.92 }}>
          <Image
            source={BOB}
            style={{ width: 132, height: 132, backgroundColor: 'transparent' }}
            contentFit="contain"
            cachePolicy="memory-disk"
            recyclingKey="bob-home-official"
          />
        </View>
        <View style={{ flex: 1, justifyContent: 'flex-end', padding: 14, paddingRight: 118 }}>
          <AppText
            className="text-[18px] font-extrabold leading-6"
            style={{ color: '#FFFFFF' }}
            numberOfLines={2}>
            {title}
          </AppText>
          <View className="mt-2 flex-row items-center" style={{ gap: 6 }}>
            {isBucksChallenge(challenge) ? (
              <AppText className="text-[16px] font-extrabold" style={{ color: '#FFFFFF' }}>
                {formatCash(pot)}
              </AppText>
            ) : (
              <>
                <CurrencyMark currency="coins" size={16} />
                <AppText className="text-[16px] font-extrabold" style={{ color: '#FFFFFF' }}>
                  {String(Math.round(pot))}
                </AppText>
              </>
            )}
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}
