import { useCallback, useEffect, useState } from 'react';
import { Pressable, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';

import { CurrencyMark } from '@/components/currency/CurrencyMark';
import { CoachMarkOverlay, expandHole } from '@/components/tour/CoachMarkOverlay';
import { useTour } from '@/components/tour/TourContext';
import { AppText } from '@/components/ui/AppText';
import { completeTutorial } from '@/lib/legal';
import { TOUR_STEPS } from '@/lib/tour';
import { THEME } from '@/lib/theme';

type TourHostProps = {
  onFinished: () => void;
};

export function TourHost({ onFinished }: TourHostProps) {
  const tour = useTour();
  const router = useRouter();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const step = TOUR_STEPS[index];
  const rawRect = tour.rectFor(step?.target ?? null);
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
    setTargetId(step.target);
    if (step.target === 'tour-official') {
      scrollHomeToTop();
    }
    const wait = step.target === 'tour-official' ? 380 : 80;
    const handle = setTimeout(() => bump(), wait);
    return () => clearTimeout(handle);
  }, [bump, scrollHomeToTop, setTargetId, step, tour.active]);

  useEffect(() => {
    if (!tour.active || !step?.target || rawRect) {
      return;
    }
    const poll = setInterval(() => bump(), 250);
    const stopPoll = setTimeout(() => clearInterval(poll), 2200);
    return () => {
      clearInterval(poll);
      clearTimeout(stopPoll);
    };
  }, [bump, rawRect, step?.target, tour.active]);

  const finish = useCallback(async () => {
    try {
      await completeTutorial();
    } catch {
      // Do not block Home if the write fails this session.
    }
    stop();
    onFinished();
  }, [onFinished, stop]);

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
      body={step.body}
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
