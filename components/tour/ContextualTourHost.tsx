import { useCallback, useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import { CoachMarkOverlay, expandHole } from '@/components/tour/CoachMarkOverlay';
import { TourDismissLink } from '@/components/tour/TourDismissLink';
import { useTour } from '@/components/tour/TourContext';
import { markContextualTourSeen } from '@/lib/contextualTour';

export function ContextualTourHost() {
  const tour = useTour();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const [waited, setWaited] = useState(false);
  const session = tour.contextual;
  const steps = session?.steps ?? [];
  const step = steps[index] ?? null;
  const rawRect = tour.rectFor(step?.target ?? null);
  const hole = expandHole(rawRect, screenW, screenH);
  const bump = tour.bump;
  const setTargetId = tour.setTargetId;

  useEffect(() => {
    setIndex(0);
    setWaited(false);
  }, [session?.id, session?.userId]);

  useEffect(() => {
    if (!session || !step) {
      return;
    }
    setWaited(false);
    const handle = setTimeout(() => setWaited(true), 2200);
    return () => clearTimeout(handle);
  }, [index, session, step]);

  useEffect(() => {
    if (!session || !step) {
      if (!tour.active && !tour.createActive) {
        setTargetId(null);
      }
      return;
    }
    setTargetId(step.target);
    const handle = setTimeout(() => bump(), 140);
    return () => clearTimeout(handle);
  }, [bump, session, setTargetId, step, tour.active, tour.createActive]);

  useEffect(() => {
    if (!session || !step?.target || rawRect) {
      return;
    }
    const poll = setInterval(() => bump(), 250);
    const stopPoll = setTimeout(() => clearInterval(poll), 2200);
    return () => {
      clearInterval(poll);
      clearTimeout(stopPoll);
    };
  }, [bump, rawRect, session, step?.target]);

  const finish = useCallback(() => {
    if (!session) {
      return;
    }
    markContextualTourSeen(session.userId, session.id);
    tour.clearContextual(session.id);
    if (!tour.active && !tour.createActive) {
      setTargetId(null);
    }
    setIndex(0);
  }, [session, setTargetId, tour]);

  useEffect(() => {
    if (!session || !step || !waited || rawRect) {
      return;
    }
    if (index >= steps.length - 1) {
      finish();
      return;
    }
    setIndex((current) => current + 1);
  }, [finish, index, rawRect, session, step, steps.length, waited]);

  if (!session || !step || tour.active || tour.createActive) {
    return null;
  }

  const last = index >= steps.length - 1;

  return (
    <CoachMarkOverlay
      hole={hole}
      placement={step.placement}
      index={index}
      total={steps.length}
      title={step.title}
      body={step.body}
      nextLabel={last ? 'Got it' : 'Next'}
      backDisabled={index === 0}
      onBack={() => setIndex((current) => Math.max(0, current - 1))}
      onNext={() => {
        if (last) {
          finish();
          return;
        }
        setIndex((current) => current + 1);
      }}
      footer={<TourDismissLink onPress={finish} />}
    />
  );
}
