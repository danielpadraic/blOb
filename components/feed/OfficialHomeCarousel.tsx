import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

import { WAVES_RAIL_HEIGHT } from '@/components/stories/StoryTray';
import { CurrencyMark } from '@/components/currency/CurrencyMark';
import { AppText } from '@/components/ui/AppText';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { challengeTypeIconLabel, challengeTypeIconSource } from '@/lib/challengeTypeIcon';
import { challengeDisplayTitle } from '@/lib/challengeTitle';
import { formatCash, isBucksChallenge } from '@/lib/currency';
import { fillGatePair, officialStripStart } from '@/lib/lobbyChallenge';
import { officialStripPrize } from '@/lib/officialSeries';
import { THEME } from '@/lib/theme';
import type { ChallengeWithStats } from '@/lib/types';

const BLOB_MARK = require('@/assets/mascot/blob-logo.png');
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
      style={{ height: WAVES_RAIL_HEIGHT, maxHeight: WAVES_RAIL_HEIGHT, overflow: 'hidden' }}>
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
            <OfficialStripSlide
              challenge={item}
              width={width}
              onPress={() => router.push(`/challenges/${item.id}`)}
            />
          )}
        />
      ) : null}
    </View>
  );
}

function OfficialStripSlide({
  challenge,
  width,
  onPress,
}: {
  challenge: ChallengeWithStats;
  width: number;
  onPress: () => void;
}) {
  const title = challengeDisplayTitle(challenge);
  const prize = officialStripPrize(challenge);
  const entry = Math.max(Number(challenge.buy_in_amount) || 0, 0);
  const gate = fillGatePair(challenge);
  const start = officialStripStart(challenge);
  const typeLabel = challengeTypeIconLabel(challenge.category);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={{
        width,
        height: WAVES_RAIL_HEIGHT,
        maxHeight: WAVES_RAIL_HEIGHT,
        overflow: 'hidden',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        gap: 6,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: THEME.border,
        backgroundColor: THEME.surface,
      }}>
      <Image
        source={BLOB_MARK}
        style={{ width: 16, height: 16, backgroundColor: 'transparent' }}
        contentFit="contain"
        accessibilityLabel="blOb"
      />
      <AppText
        className="text-[12px] font-semibold"
        style={{ flexGrow: 1, flexShrink: 1, minWidth: 0, color: THEME.textPrimary, lineHeight: 15 }}
        numberOfLines={2}>
        {title}
      </AppText>
      <Image
        source={challengeTypeIconSource(challenge.category)}
        style={{ width: 16, height: 16, backgroundColor: 'transparent' }}
        contentFit="contain"
        accessibilityLabel={typeLabel}
      />
      {entry > 0 ? <StripMoney amount={entry} challenge={challenge} /> : null}
      <StripMoney amount={prize} challenge={challenge} />
      <AppText className="text-[11px]" style={{ color: THEME.textMuted, flexShrink: 0 }} numberOfLines={1}>
        {start}
      </AppText>
      {gate ? (
        <View className="flex-row items-center" style={{ gap: 3, flexShrink: 0 }}>
          <AppText className="text-[11px]" style={{ color: THEME.textMuted }} numberOfLines={1}>
            {`${gate.count}/${gate.min}`}
          </AppText>
          <Glyph name={GLYPH.people} color={THEME.textMuted} size={12} />
        </View>
      ) : null}
    </Pressable>
  );
}

function StripMoney({
  amount,
  challenge,
}: {
  amount: number;
  challenge: ChallengeWithStats;
}) {
  if (isBucksChallenge(challenge)) {
    return (
      <AppText className="text-[11px] font-semibold" style={{ color: THEME.textPrimary, flexShrink: 0 }} numberOfLines={1}>
        {formatCash(amount)}
      </AppText>
    );
  }
  return (
    <View className="flex-row items-center" style={{ gap: 3, flexShrink: 0 }}>
      <CurrencyMark currency="coins" size={11} />
      <AppText className="text-[11px] font-semibold" style={{ color: THEME.textPrimary }} numberOfLines={1}>
        {String(Math.round(amount))}
      </AppText>
    </View>
  );
}
