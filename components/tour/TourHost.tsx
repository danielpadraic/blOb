import { useCallback, useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';

import { CurrencyMark } from '@/components/currency/CurrencyMark';
import { CoachMarkOverlay, expandHole } from '@/components/tour/CoachMarkOverlay';
import { TourDismissLink } from '@/components/tour/TourDismissLink';
import { useTour } from '@/components/tour/TourContext';
import { useAuth } from '@/hooks/useAuth';
import { markHomeTourCompleted } from '@/lib/homeTour';
import { completeTutorial } from '@/lib/legal';
import {
  homeTourBody,
  homeTourChrome,
  homeTourTarget,
  nextHomeTourIndex,
  shouldSkipHomeStep,
  TOUR_STEPS,
} from '@/lib/tour';

type TourHostProps = {
  onFinished: () => void;
};

export function TourHost({ onFinished }: TourHostProps) {
  const tour = useTour();
  const { user } = useAuth();
  const router = useRouter();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [waited, setWaited] = useState(false);
  const step = TOUR_STEPS[index];
  const hasRect = useCallback((id: string) => Boolean(tour.rectFor(id)), [tour]);
  const target = step ? homeTourTarget(step, hasRect) : null;
  const rawRect = tour.rectFor(target);
  const hole = expandHole(rawRect, screenW, screenH);
  const bump = tour.bump;
  const setTargetId = tour.setTargetId;
  const scrollHomeToTop = tour.scrollHomeToTop;
  const stop = tour.stop;
  const setLogoMenu = tour.setLogoMenu;
  const setPlusSheet = tour.setPlusSheet;

  useEffect(() => {
    setIndex(0);
    setWaited(false);
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
      setLogoMenu(false);
      setPlusSheet(null);
      return;
    }
    const chrome = homeTourChrome(step.id);
    setLogoMenu(chrome.logoMenu);
    setPlusSheet(chrome.plusSheet);
    setTargetId(target);
    if (target === 'tour-waves' || target === 'tour-rounds') {
      scrollHomeToTop();
    }
    const wait =
      chrome.logoMenu || chrome.plusSheet || target === 'tour-waves' || target === 'tour-rounds'
        ? 380
        : 80;
    const handle = setTimeout(() => bump(), wait);
    return () => {
      clearTimeout(handle);
    };
  }, [bump, scrollHomeToTop, setLogoMenu, setPlusSheet, setTargetId, step, target, tour.active]);

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

  useEffect(() => {
    if (!tour.active || !step) {
      return;
    }
    setWaited(false);
    const handle = setTimeout(() => setWaited(true), 2200);
    return () => clearTimeout(handle);
  }, [index, step, tour.active]);

  useEffect(() => {
    if (!tour.active || !step || !waited || rawRect) {
      return;
    }
    if (!shouldSkipHomeStep(step, hasRect)) {
      return;
    }
    const next = nextHomeTourIndex(index, 1, hasRect);
    if (next >= TOUR_STEPS.length) {
      void finish();
      return;
    }
    if (next >= 0) {
      setIndex(next);
    }
    // finish is stable enough for this skip-after-wait path.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasRect, index, rawRect, step, tour.active, waited]);

  const finish = useCallback(async () => {
    setLogoMenu(false);
    setPlusSheet(null);
    markHomeTourCompleted(user?.id);
    stop();
    try {
      await completeTutorial();
    } catch {
      // Session flag already set; do not restart this session or after background.
    }
    onFinished();
  }, [onFinished, setLogoMenu, setPlusSheet, stop, user?.id]);

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
      body={homeTourBody(step, hasRect)}
      titleAccessory={
        step.id === 'coins' ? (
          <CurrencyMark currency="coins" size={16} />
        ) : step.id === 'money' ? (
          <CurrencyMark currency="bucks" size={16} accessibilityLabel="$" />
        ) : null
      }
      nextLabel={index === TOUR_STEPS.length - 1 ? 'Done' : 'Next'}
      backDisabled={index === 0}
      onBack={() => {
        const prev = nextHomeTourIndex(index, -1, hasRect);
        setIndex(prev < 0 ? 0 : prev);
      }}
      onNext={() => {
        if (index === TOUR_STEPS.length - 1) {
          void finish();
          return;
        }
        const next = nextHomeTourIndex(index, 1, hasRect);
        if (next >= TOUR_STEPS.length) {
          void finish();
          return;
        }
        setIndex(next);
      }}
      footer={<TourDismissLink onPress={() => void finish()} />}
    />
  );
}
