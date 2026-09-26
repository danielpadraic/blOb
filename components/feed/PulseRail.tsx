import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, usePathname, useRouter } from 'expo-router';

import { TourAnchor } from '@/components/tour/TourAnchor';
import { useContextualTour } from '@/components/tour/useContextualTour';
import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { useAfterFirstPaint } from '@/hooks/useAfterFirstPaint';
import { useAuth } from '@/hooks/useAuth';
import { useHomePulse } from '@/hooks/useHomePulse';
import { useOfficialCoinStatus, useRejoinOfficialCoin } from '@/hooks/useOfficialCoin';
import { useMyProfile } from '@/hooks/useProfile';
import { HOME_LIVE_PILLS_STEPS } from '@/lib/contextualTour';
import { wasHomeTourCompleted } from '@/lib/homeTour';
import { copy } from '@/lib/copy';
import { OFFICIAL_COIN_REJOIN_PILL } from '@/lib/officialCoin';
import {
  partitionPulsePills,
  pulseChallengeHref,
  pulsePrivacyLabel,
  sortPulsePills,
  type PulseFace,
  type PulsePill,
} from '@/lib/homePulse';
import {
  challengeTypeIconLabel,
  challengeTypeIconSource,
  challengeTypeIconTint,
} from '@/lib/challengeTypeIcon';
import { pushChallengeHref } from '@/lib/challengeNav';
import { THEME, themeShadow } from '@/lib/theme';

const PILL_WIDTH = 158;
const CARD_HEIGHT = 200;
const FACE = 22;

const BLOB_WORDMARK = require('@/assets/mascot/blob-logo.png');
/** Same Bob the Official Overview uses. No new art. */
const BOB_WATERMARK = require('@/assets/login/blob-login.png');
const OFFICIAL_FIELD = ['#1B5A50', '#123832', '#0E2421'] as const;

function FacePile({ faces, overflow, dark }: { faces: PulseFace[]; overflow: number; dark: boolean }) {
  if (faces.length === 0) {
    return null;
  }
  const ring = dark ? 'rgba(12,30,27,0.9)' : THEME.surface;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1, minWidth: 0 }}>
      {faces.map((face, index) => (
        <View
          key={face.id || `face-${index}`}
          style={{
            marginLeft: index === 0 ? 0 : -8,
            zIndex: faces.length - index,
            borderWidth: 1.5,
            borderColor: ring,
            borderRadius: FACE / 2,
          }}>
          <Avatar uri={face.avatarUrl} name={face.name} size={FACE} />
        </View>
      ))}
      {overflow > 0 ? (
        <View
          style={{
            marginLeft: -8,
            height: FACE,
            minWidth: FACE,
            paddingHorizontal: 5,
            borderRadius: FACE / 2,
            borderWidth: 1.5,
            borderColor: ring,
            backgroundColor: dark ? 'rgba(231,247,243,0.22)' : THEME.surface2,
            alignItems: 'center',
            justifyContent: 'center',
          }}>
          <AppText
            className="text-[10px] font-bold"
            style={{ color: dark ? '#F7FFFC' : THEME.textMuted }}>
            {`+${overflow}`}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

function LiveNowLine({ dark }: { dark: boolean }) {
  return (
    <View className="flex-row items-center" style={{ gap: 5 }}>
      <View
        style={{
          width: 7,
          height: 7,
          borderRadius: 4,
          backgroundColor: dark ? THEME.accentBright : THEME.accent,
        }}
      />
      <AppText
        className="text-[11px] font-bold"
        style={{ color: dark ? 'rgba(231,247,243,0.9)' : THEME.accent }}>
        {copy('pulse.liveNow')}
      </AppText>
    </View>
  );
}

function CategoryGlyph({ category, dark }: { category?: string | null; dark: boolean }) {
  return (
    <View
      style={{
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: dark ? 'rgba(231,247,243,0.16)' : challengeTypeIconTint(category),
      }}>
      <Image
        source={challengeTypeIconSource(category)}
        style={{ width: 20, height: 20, backgroundColor: 'transparent' }}
        contentFit="contain"
        cachePolicy="memory-disk"
        accessibilityLabel={challengeTypeIconLabel(category)}
      />
    </View>
  );
}

function PrivacyChip({ label, dark }: { label: string; dark: boolean }) {
  return (
    <View
      className="flex-row items-center"
      style={{
        gap: 4,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: dark ? 'rgba(231,247,243,0.18)' : 'rgba(255,255,255,0.92)',
      }}>
      <Glyph name={GLYPH.people} color={dark ? '#F7FFFC' : THEME.textMuted} size={11} />
      <AppText
        className="text-[10px] font-bold"
        style={{ color: dark ? '#F7FFFC' : THEME.textMuted }}>
        {label}
      </AppText>
    </View>
  );
}

/** Dark house field. Bob watermark, blOb wordmark, mint Official check. */
function OfficialPulseCard({ pill, onPress }: { pill: PulsePill; onPress: () => void }) {
  const newCheckins = Math.max(pill.newCheckins ?? 0, 0);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${pill.title}. Official. ${
        newCheckins > 0 ? `${newCheckins} new check-ins` : copy('pulse.liveNow')
      }`}
      onPress={onPress}
      style={{
        width: PILL_WIDTH,
        height: CARD_HEIGHT,
        borderRadius: 20,
        overflow: 'hidden',
        ...themeShadow('card'),
      }}>
      <LinearGradient
        colors={[...OFFICIAL_FIELD]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          right: -26,
          top: 6,
          bottom: 6,
          width: '68%',
          opacity: 0.16,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Image
          source={BOB_WATERMARK}
          style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}
          contentFit="contain"
          cachePolicy="memory-disk"
          accessibilityLabel=""
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      </View>

      <View style={{ flex: 1, padding: 12, justifyContent: 'space-between' }}>
        <View style={{ gap: 8 }}>
          <View className="flex-row items-center justify-between" style={{ gap: 6 }}>
            <Image
              source={BLOB_WORDMARK}
              style={{ width: 38, height: 15, backgroundColor: 'transparent' }}
              contentFit="contain"
              tintColor="#F7FFFC"
              accessibilityLabel="blOb"
            />
            <View
              className="flex-row items-center"
              style={{
                gap: 3,
                paddingHorizontal: 6,
                paddingVertical: 3,
                borderRadius: 999,
                backgroundColor: 'rgba(114,217,203,0.22)',
              }}>
              <Glyph name={GLYPH.check} color={THEME.accentBright} size={11} />
              <AppText className="text-[10px] font-bold" style={{ color: THEME.accentBright }}>
                Official
              </AppText>
            </View>
          </View>
          <AppText
            numberOfLines={2}
            className="text-[16px] font-extrabold leading-5"
            style={{ color: '#FFFFFF' }}>
            {pill.title}
          </AppText>
        </View>

        <View style={{ gap: 8 }}>
          <CategoryGlyph category={pill.category} dark />
          <LiveNowLine dark />
          <FacePile faces={pill.faces} overflow={pill.faceOverflow ?? 0} dark />
          {newCheckins > 0 ? (
            <AppText
              numberOfLines={1}
              className="text-[11px] font-semibold"
              style={{ color: 'rgba(231,247,243,0.78)' }}>
              {`${newCheckins} new check-in${newCheckins === 1 ? '' : 's'}`}
            </AppText>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

/** Peer room. Cover photo when there is one, light field and a glyph when not. */
function PeerPulseCard({ pill, onPress }: { pill: PulsePill; onPress: () => void }) {
  const cover = String(pill.coverUrl ?? '').trim();
  const dark = Boolean(cover);
  const privacy = pulsePrivacyLabel(pill.privacyMode);
  const line = String(pill.activityLine ?? '').trim();
  const ink = dark ? '#FFFFFF' : THEME.textPrimary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${pill.title}. ${line || copy('pulse.liveNow')}`}
      onPress={onPress}
      style={{
        width: PILL_WIDTH,
        height: CARD_HEIGHT,
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: pill.isCallout ? THEME.calloutSoft : THEME.surface,
        borderWidth: dark ? 0 : 1,
        borderColor: pill.isCallout ? THEME.callout : THEME.border,
        ...themeShadow('card'),
      }}>
      {cover ? (
        <>
          <Image
            source={{ uri: cover }}
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
            contentFit="cover"
            cachePolicy="memory-disk"
            accessibilityLabel=""
          />
          {/* Scrim so the title stays readable on any photo. */}
          <LinearGradient
            colors={['rgba(8,22,20,0.15)', 'rgba(8,22,20,0.55)', 'rgba(8,22,20,0.82)']}
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
          />
        </>
      ) : null}

      <View style={{ flex: 1, padding: 12, justifyContent: 'space-between' }}>
        <View style={{ gap: 8 }}>
          {privacy ? (
            <View className="flex-row">
              <PrivacyChip label={privacy} dark={dark} />
            </View>
          ) : null}
          <AppText
            numberOfLines={2}
            className="text-[16px] font-extrabold leading-5"
            style={{ color: ink }}>
            {pill.title}
          </AppText>
        </View>

        <View style={{ gap: 8 }}>
          {cover ? null : <CategoryGlyph category={pill.category} dark={false} />}
          <FacePile faces={pill.faces} overflow={pill.faceOverflow ?? 0} dark={dark} />
          {line ? (
            <AppText
              numberOfLines={2}
              className="text-[11px] font-semibold leading-4"
              style={{ color: dark ? 'rgba(255,255,255,0.86)' : THEME.textMuted }}>
              {line}
            </AppText>
          ) : (
            <LiveNowLine dark={dark} />
          )}
        </View>
      </View>
    </Pressable>
  );
}

function PulseChip({ pill }: { pill: PulsePill }) {
  const router = useRouter();
  const pathname = usePathname();
  function open() {
    // Always this room's Live thread, never the lobby.
    const href = String(pulseChallengeHref(pill.id));
    pushChallengeHref(router, href, 'home-pill', pill.id, pathname);
  }
  return pill.isOfficial && !pill.isCallout ? (
    <OfficialPulseCard pill={pill} onPress={open} />
  ) : (
    <PeerPulseCard pill={pill} onPress={open} />
  );
}

/**
 * Slot 0 after someone leaves Official Coin. Same height and radius as a live
 * pill so the rail does not jump, teal so it reads as house.
 */
function RejoinOfficialChip({
  busy,
  error,
  onPress,
}: {
  busy: boolean;
  error: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy }}
      accessibilityLabel={`${OFFICIAL_COIN_REJOIN_PILL.title}. ${OFFICIAL_COIN_REJOIN_PILL.subline}`}
      disabled={busy}
      onPress={onPress}
      style={{
        width: PILL_WIDTH,
        height: CARD_HEIGHT,
        padding: 12,
        borderRadius: 20,
        backgroundColor: THEME.accentSoft,
        borderWidth: 1,
        borderColor: THEME.accent,
        opacity: busy ? 0.6 : 1,
        justifyContent: 'space-between',
        ...themeShadow('card'),
      }}>
      <AppText
        numberOfLines={2}
        className="text-[16px] font-extrabold leading-5"
        style={{ color: THEME.accent }}>
        {OFFICIAL_COIN_REJOIN_PILL.title}
      </AppText>
      <AppText numberOfLines={3} className="text-[12px] leading-4" style={{ color: THEME.textMuted }}>
        {error ? OFFICIAL_COIN_REJOIN_PILL.error : OFFICIAL_COIN_REJOIN_PILL.subline}
      </AppText>
    </Pressable>
  );
}

function SeeMoreChip({
  expanded,
  onPress,
}: {
  expanded: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={expanded ? copy('pulse.showLess') : copy('pulse.seeMore')}
      onPress={onPress}
      style={{
        width: 112,
        height: CARD_HEIGHT,
        paddingHorizontal: 12,
        borderRadius: 20,
        backgroundColor: THEME.surface2,
        borderWidth: 1,
        borderColor: THEME.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <AppText numberOfLines={2} className="text-center text-[13px] font-extrabold" style={{ color: THEME.textMuted }}>
        {expanded ? copy('pulse.showLess') : copy('pulse.seeMore')}
      </AppText>
    </Pressable>
  );
}

/** Home Pulse. Fetches itself so a refresh does not remount the Home composer. */
export function PulseRail() {
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const railReady = useAfterFirstPaint();
  const pulse = useHomePulse({ enabled: railReady });
  const refetchPulse = pulse.refetch;
  const coin = useOfficialCoinStatus();
  const rejoin = useRejoinOfficialCoin();
  // Optimistic: the Rejoin pill leaves and the two house pills land before the
  // rail refetch comes back.
  const [rejoined, setRejoined] = useState(false);
  const [rejoinFailed, setRejoinFailed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (railReady) {
        void refetchPulse();
      }
    }, [railReady, refetchPulse]),
  );

  const showRejoin = coin.status.canRejoin && !rejoined;

  useEffect(() => {
    if (coin.status.canRejoin) {
      setRejoined(false);
    }
  }, [coin.status.canRejoin]);

  const [showAged, setShowAged] = useState(false);

  const pills = useMemo(() => {
    const live = pulse.data ?? [];
    if (!rejoined) {
      return live;
    }
    const seen = new Set(live.map((pill) => pill.id));
    const optimistic: PulsePill[] = coin.status.rooms
      .filter((room) => room.challenge.id && !seen.has(String(room.challenge.id)))
      .map((room) => ({
        id: String(room.challenge.id),
        title: String(room.challenge.title ?? ''),
        snippet: copy('pulse.noChatter'),
        faces: [],
        lastAt: null,
        officialCoinKind: room.kind,
        isOfficial: true,
        category: 'fitness',
        activityLine: '',
      }));
    return sortPulsePills([...optimistic, ...live]);
  }, [coin.status.rooms, pulse.data, rejoined]);

  const { visible, aged } = useMemo(() => partitionPulsePills(pills), [pills]);

  const showRail = showRejoin || (pulse.isFetched && !pulse.isError && pills.length > 0);
  const homeTourDone = wasHomeTourCompleted(profile?.id, profile?.tutorial_completed_at);
  useContextualTour('home-live-pills', HOME_LIVE_PILLS_STEPS, showRail && homeTourDone, user?.id);

  function onRejoin() {
    if (rejoin.isPending) {
      return;
    }
    setRejoinFailed(false);
    setRejoined(true);
    rejoin.mutate(undefined, {
      onError: () => {
        setRejoined(false);
        setRejoinFailed(true);
      },
    });
  }

  if (!showRail) {
    return null;
  }

  return (
    <TourAnchor id="tour-live-pills">
    <View style={{ marginHorizontal: -16 }} accessibilityLabel={copy('pulse.rail')}>
      <ScrollView
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 2 }}>
        {showRejoin ? (
          <RejoinOfficialChip
            busy={rejoin.isPending}
            error={rejoinFailed}
            onPress={onRejoin}
          />
        ) : null}
        {visible.map((pill) => (
          <PulseChip key={pill.id} pill={pill} />
        ))}
        {showAged
          ? aged.map((pill) => <PulseChip key={pill.id} pill={pill} />)
          : null}
        {aged.length > 0 ? (
          <SeeMoreChip
            expanded={showAged}
            onPress={() => setShowAged((open) => !open)}
          />
        ) : null}
      </ScrollView>
    </View>
    </TourAnchor>
  );
}
