import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';

import { CurrencyMark } from '@/components/currency/CurrencyMark';
import { BlobMascot } from '@/components/mascot/BlobMascot';
import { CoachMarkOverlay, expandHole } from '@/components/tour/CoachMarkOverlay';
import { useTour } from '@/components/tour/TourContext';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { markHomeTourCompleted } from '@/lib/homeTour';
import { completeTutorial } from '@/lib/legal';
import { TOUR_STEPS } from '@/lib/tour';
import { THEME } from '@/lib/theme';

type TourHostProps = {
  onFinished: () => void;
};

export function TourHost({ onFinished }: TourHostProps) {
  const tour = useTour();
  const { user } = useAuth();
  const router = useRouter();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const step = TOUR_STEPS[index];
  const target =
    step?.id === 'rounds' && tour.rectFor('tour-rounds')
      ? 'tour-rounds'
      : (step?.target ?? null);
  const rawRect = tour.rectFor(target);
  const hole = expandHole(rawRect, screenW, screenH);
  const bump = tour.bump;
  const setTargetId = tour.setTargetId;
  const scrollHomeToTop = tour.scrollHomeToTop;
  const stop = tour.stop;

  useEffect(() => {
    setIndex(0);
  }, [tour.runId]);

  useEffect(() => {
    if (!tour.active) {
      return;
    }
    router.navigate('/feed');
  }, [router, tour.active]);

  useEffect(() => {
    if (!tour.active || !step) {
      setTargetId(null);
      return;
    }
    setTargetId(target);
    if (target === 'tour-waves' || target === 'tour-rounds') {
      scrollHomeToTop();
    }
    const wait = target === 'tour-waves' || target === 'tour-rounds' ? 380 : 80;
    const handle = setTimeout(() => bump(), wait);
    return () => clearTimeout(handle);
  }, [bump, scrollHomeToTop, setTargetId, step, target, tour.active]);

  useEffect(() => {
    if (!tour.active || !target || rawRect) {
      return;
    }
    const poll = setInterval(() => bump(), 250);
    const stopPoll = setTimeout(() => clearInterval(poll), 2200);
    return () => {
      clearInterval(poll);
      clearTimeout(stopPoll);
    };
  }, [bump, rawRect, target, tour.active]);

  const finish = useCallback(async () => {
    markHomeTourCompleted(user?.id);
    stop();
    try {
      await completeTutorial();
    } catch {
      // Session flag already set; do not restart this session or after background.
    }
    onFinished();
  }, [onFinished, stop, user?.id]);

  if (!tour.active || !step) {
    return null;
  }

  return (
    <CoachMarkOverlay
      hole={hole}
      placement={step.placement}
      index={index}
      total={TOUR_STEPS.length}
      title={step.title}
      body={step.id === 'tabLobby' ? <LobbyTourBody /> : step.body}
      titleAccessory={
        step.id === 'coins' ? (
          <CurrencyMark currency="coins" size={16} />
        ) : step.id === 'money' ? (
          <CurrencyMark currency="bucks" size={16} accessibilityLabel="$" />
        ) : null
      }
      nextLabel={index === TOUR_STEPS.length - 1 ? 'Done' : 'Next'}
      backDisabled={index === 0}
      onBack={() => setIndex((current) => Math.max(0, current - 1))}
      onNext={() => {
        if (index === TOUR_STEPS.length - 1) {
          void finish();
          return;
        }
        setIndex((current) => current + 1);
      }}
      footer={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Skip tour"
          onPress={() => void finish()}
          hitSlop={8}
          style={{ minHeight: 44, justifyContent: 'center' }}>
          <AppText className="text-center text-sm font-semibold" style={{ color: THEME.accent }}>
            Skip tour
          </AppText>
        </Pressable>
      }
    />
  );
}

function LobbyTourBody() {
  const logoH = 72 * 0.55;
  return (
    <AppText
      className="mt-2 text-[13px] leading-5 text-muted"
      accessibilityLabel="View challenges hosted by you or others, challenges you have joined, or Official challenges hosted by blOb.">
      View challenges hosted by you or others, challenges you have joined, or Official challenges hosted by{' '}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 72,
          height: logoH,
          transform: [{ translateY: Platform.OS === 'ios' ? 3 : 5 }],
          ...(Platform.OS === 'web' ? ({ display: 'inline-flex' } as object) : null),
        }}>
        <BlobMascot variant="logo" size={72} />
      </View>
      .
    </AppText>
  );
}
