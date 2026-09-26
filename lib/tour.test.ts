import { describe, expect, it } from 'vitest';

import {
  COPY_TONES,
  COPY_TONE_OPTIONS,
  PROFILE_SETUP_TONE_OPTIONS,
  asCopyTone,
  profileSetupTone,
} from '@/lib/copy';
import {
  homeTourBody,
  homeTourChrome,
  nextHomeTourIndex,
  shouldSkipHomeStep,
  TOUR_STEPS,
} from '@/lib/tour';

describe('home tour copy', () => {
  it('walks the current product in six cards', () => {
    expect(TOUR_STEPS.map((step) => step.id)).toEqual([
      'homeFeed',
      'officialFitness',
      'plusCheckIn',
      'challengePage',
      'consistency',
      'reminders',
    ]);
    const joined = TOUR_STEPS.map((step) => `${step.title} ${step.body}`).join('\n');
    expect(joined).toMatch(/Home is the feed/);
    expect(joined).toMatch(/See More/);
    expect(joined).toMatch(/free coins/);
    expect(joined).toMatch(/pre-workout selfie/);
    expect(joined).toMatch(/post-workout selfie/);
    expect(joined).toMatch(/30 minutes/);
    expect(joined).toMatch(/Check In picks the room/);
    expect(joined).toMatch(/Overview/);
    expect(joined).toMatch(/Board/);
    expect(joined).toMatch(/Live/);
    expect(joined).toMatch(/one complete check-in/);
    expect(joined).toMatch(/Rookies vs\. Veterans/);
    expect(joined).toMatch(/open Overview/);
    expect(joined).not.toMatch(/I believe/i);
    expect(joined).not.toMatch(/Bucks/i);
    expect(joined).not.toMatch(/player pool/i);
    expect(joined).not.toMatch(/\bFlags?\b/);
    expect(joined).not.toMatch(/\bWave\b/);
    expect(TOUR_STEPS.every((step) => step.target == null)).toBe(true);
    expect(homeTourChrome('homeFeed')).toEqual({ logoMenu: false, plusSheet: null });
  });

  it('does not treat a missing measure as a skipped or finished card', () => {
    const step = TOUR_STEPS[0];
    expect(shouldSkipHomeStep(step, () => false)).toBe(false);
    expect(homeTourBody(step, () => false)).toMatch(/Home is the feed/);
    expect(nextHomeTourIndex(0, 1, () => false)).toBe(1);
    expect(nextHomeTourIndex(TOUR_STEPS.length - 2, 1, () => false)).toBe(TOUR_STEPS.length - 1);
  });

  it('maps Neutral tone to Gentle and only offers Gentle | Honest', () => {
    expect(asCopyTone('neutral')).toBe('gentle');
    expect(asCopyTone(null)).toBe('gentle');
    expect(asCopyTone(undefined)).toBe('gentle');
    expect(profileSetupTone('neutral')).toBe('gentle');
    expect(COPY_TONES).toEqual(['gentle', 'honest']);
    expect(COPY_TONE_OPTIONS.map((option) => option.value)).toEqual(['gentle', 'honest']);
    expect(PROFILE_SETUP_TONE_OPTIONS.map((option) => option.value)).toEqual(['gentle', 'honest']);
  });
});
