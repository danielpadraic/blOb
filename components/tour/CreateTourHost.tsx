import { useCallback, useEffect, useState } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CurrencyMark } from '@/components/currency/CurrencyMark';
import { CoachMarkOverlay, expandHole } from '@/components/tour/CoachMarkOverlay';
import { useTour } from '@/components/tour/TourContext';
import { AppText } from '@/components/ui/AppText';
import { setCreateTourOptOut } from '@/lib/legal';
import { createTourSteps } from '@/lib/createTour';
import { createTourViewport, scrollDeltaToCenter, TOUR_SCROLL_MS } from '@/lib/tourScroll';
import { THEME } from '@/lib/theme';

export function CreateTourHost() {
  const tour = useTour();
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const steps = tour.createTrack ? createTourSteps(tour.createTrack) : [];
  const step = steps[index];
  const rawRect = tour.rectFor(step?.target ?? null);
  const viewport = createTourViewport(screenH, insets);
  const hole = expandHole(rawRect, screenW, screenH);
  const bump = tour.bump;
  const setTargetId = tour.setTargetId;
  const peekCreateStep = tour.peekCreateStep;
  const stopCreate = tour.stopCreate;
  const centerCreateRect = tour.centerCreateRect;
  const bucks = tour.createCurrency === 'bucks';

  useEffect(() => {
    setIndex(0);
  }, [tour.createRunId]);

  useEffect(() => {
    if (!tour.createActive || !step) {
      if (!tour.active) {
        setTargetId(null);
      }
      return;
    }
    if (typeof step.wizardStep === 'number') {
      peekCreateStep(step.wizardStep);
    }
    setTargetId(step.target);
    const handle = setTimeout(() => bump(), 140);
    return () => clearTimeout(handle);
  }, [bump, peekCreateStep, setTargetId, step, tour.active, tour.createActive]);

  useEffect(() => {
    if (!tour.createActive || !step?.target || rawRect) {
      return;
    }
    const poll = setInterval(() => bump(), 250);
    const stopPoll = setTimeout(() => clearInterval(poll), 2200);
    return () => {
      clearInterval(poll);
      clearTimeout(stopPoll);
    };
  }, [bump, rawRect, step?.target, tour.createActive]);

  const rectKey = rawRect
    ? `${step?.id}:${Math.round(rawRect.y)}:${Math.round(rawRect.height)}`
    : '';

  useEffect(() => {
    if (!tour.createActive || !rawRect) {
      return;
    }
    const nextViewport = createTourViewport(screenH, insets);
    if (Math.abs(scrollDeltaToCenter(rawRect, nextViewport)) < 8) {
      return;
    }
    centerCreateRect(rawRect, nextViewport);
    const handle = setTimeout(() => bump(), TOUR_SCROLL_MS + 40);
    return () => clearTimeout(handle);
  }, [bump, centerCreateRect, insets.bottom, insets.top, rawRect, rectKey, screenH, tour.createActive]);

  const skip = useCallback(() => {
    stopCreate();
  }, [stopCreate]);

  const dontShow = useCallback(async () => {
    try {
      await setCreateTourOptOut(true);
    } catch {
      // Still dismiss this opening so publish is never blocked.
    }
    stopCreate();
  }, [stopCreate]);

  if (!tour.createActive || !step) {
    return null;
  }

  const last = index === steps.length - 1;
  const showCurrencyMark = step.id === 'simple-currency' || step.id === 'adv-currency';
  const title = bucks && step.titleBucks ? step.titleBucks : step.title;
  const body = bucks && step.bodyBucks ? step.bodyBucks : step.body;

  return (
    <CoachMarkOverlay
      hole={hole}
      placement={step.placement}
      index={index}
      total={steps.length}
      title={title}
      body={body}
      topReserve={viewport.top}
      bottomReserve={screenH - viewport.bottom}
      titleAccessory={
        showCurrencyMark ? (
          <View className="flex-row items-center" style={{ gap: 4 }}>
            <CurrencyMark currency="coins" size={16} />
            <CurrencyMark currency="bucks" size={16} accessibilityLabel="$" />
          </View>
        ) : null
      }
      nextLabel={last ? 'Done' : 'Next'}
      backDisabled={index === 0}
      onBack={() => setIndex((current) => Math.max(0, current - 1))}
      onNext={() => {
        if (last) {
          skip();
          return;
        }
        setIndex((current) => current + 1);
      }}
      footer={
        <View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Skip tour"
            onPress={skip}
            hitSlop={8}
            style={{ minHeight: 44, justifyContent: 'center' }}>
            <AppText className="text-center text-sm font-semibold" style={{ color: THEME.accent }}>
              Skip
            </AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Don’t show this again"
            onPress={() => void dontShow()}
            hitSlop={8}
            style={{ minHeight: 44, justifyContent: 'center' }}>
            <AppText className="text-center text-sm font-semibold text-muted">Don’t show this again</AppText>
          </Pressable>
        </View>
      }
    />
  );
}
