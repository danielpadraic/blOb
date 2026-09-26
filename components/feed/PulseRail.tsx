import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useFocusEffect, usePathname, useRouter } from 'expo-router';

import { TourAnchor } from '@/components/tour/TourAnchor';
import { useContextualTour } from '@/components/tour/useContextualTour';
import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
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
  sortPulsePills,
  type PulseFace,
  type PulsePill,
} from '@/lib/homePulse';
import { pushChallengeHref } from '@/lib/challengeNav';
import { THEME, flexChildMin, themeShadow } from '@/lib/theme';

const PILL_WIDTH = 168;
const FACE = 18;

function FacePile({ faces }: { faces: PulseFace[] }) {
  if (faces.length === 0) {
    return null;
  }
  return (
    <View style={{ flexDirection: 'row', flexShrink: 0, width: FACE + (faces.length - 1) * 11 }}>
      {faces.map((face, index) => (
        <View
          key={face.id || `face-${index}`}
          style={{
            marginLeft: index === 0 ? 0 : -7,
            zIndex: faces.length - index,
            borderWidth: 1.5,
            borderColor: THEME.surface,
            borderRadius: FACE / 2,
          }}>
          <Avatar uri={face.avatarUrl} name={face.name} size={FACE} />
        </View>
      ))}
    </View>
  );
}

function PulseChip({ pill }: { pill: PulsePill }) {
  const router = useRouter();
  const pathname = usePathname();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${pill.title}. ${pill.snippet}`}
      onPress={() => {
        const href = String(pulseChallengeHref(pill.id));
        pushChallengeHref(router, href, 'home-pill', pill.id, pathname);
      }}
      style={{
        width: PILL_WIDTH,
        minHeight: 44,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: THEME.radius,
        backgroundColor: pill.isCallout ? THEME.calloutSoft : THEME.surface,
        borderWidth: 1,
        borderColor: pill.isCallout ? THEME.callout : THEME.border,
        ...themeShadow('card'),
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <AppText
          numberOfLines={1}
          className="text-[13px] font-extrabold text-charcoal"
          style={{ flex: 1, ...flexChildMin() }}>
          {pill.title}
        </AppText>
        <FacePile faces={pill.faces} />
      </View>
      <AppText numberOfLines={1} className="mt-1 text-[12px] text-muted">
        {pill.snippet}
      </AppText>
    </Pressable>
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
        minHeight: 44,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: THEME.radius,
        backgroundColor: THEME.accentSoft,
        borderWidth: 1,
        borderColor: THEME.accent,
        opacity: busy ? 0.6 : 1,
        ...themeShadow('card'),
      }}>
      <AppText
        numberOfLines={1}
        className="text-[13px] font-extrabold"
        style={{ color: THEME.accent }}>
        {OFFICIAL_COIN_REJOIN_PILL.title}
      </AppText>
      <AppText numberOfLines={1} className="mt-1 text-[12px]" style={{ color: THEME.textMuted }}>
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
        width: PILL_WIDTH,
        minHeight: 44,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: THEME.radius,
        backgroundColor: THEME.surface2,
        borderWidth: 1,
        borderColor: THEME.border,
        justifyContent: 'center',
      }}>
      <AppText numberOfLines={1} className="text-[13px] font-extrabold" style={{ color: THEME.textMuted }}>
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
