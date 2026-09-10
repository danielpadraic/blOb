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
  homeTourTarget,
  nextHomeTourIndex,
  officialTourTarget,
  ROUNDS_FALLBACK_BODY,
  shouldSkipHomeStep,
  TOUR_STEPS,
} from '@/lib/tour';

describe('home tour copy', () => {
  it('walks hamburger, wallet, banner, waves, +, Friends, and You — not Live or Lobby', () => {
    const ids = TOUR_STEPS.map((step) => step.id);
    expect(ids).toEqual([
      'menu',
      'coins',
      'money',
      'search',
      'dm',
      'bell',
      'official',
      'waves',
      'rounds',
      'tabCreate',
      'tabFriends',
      'tabYou',
    ]);
    expect(ids).toHaveLength(12);
    expect(ids).not.toContain('tabFeed');
    expect(ids).not.toContain('tabLobby');
    expect(ids).not.toContain('goal');

    const menu = TOUR_STEPS.find((step) => step.id === 'menu');
    expect(menu).toMatchObject({
      target: 'tour-menu',
      title: 'Menu',
    });
    expect(menu?.body).toMatch(/Create a Challenge/);
    expect(menu?.body).toMatch(/not on the \+/);

    const create = TOUR_STEPS.find((step) => step.id === 'tabCreate');
    expect(create?.title).toBe('+');
    expect(create?.body).toMatch(/Quick Start/);
    expect(create?.body).toMatch(/Wave/);
    expect(create?.body).not.toMatch(/Create Challenge/);

    const official = TOUR_STEPS.find((step) => step.id === 'official');
    expect(official?.target).toBe('tour-official-banner');
    expect(official?.target).not.toBe('tour-tab-lobby');

    const you = TOUR_STEPS.find((step) => step.id === 'tabYou');
    expect(you?.body).toMatch(/Lift/);
    expect(you?.body).toMatch(/flag tab/);

    const joined = TOUR_STEPS.map((step) => `${step.title} ${step.body}`).join('\n');
    expect(joined).not.toMatch(/Bucks/i);
    expect(joined).not.toMatch(/I believe/i);
    expect(joined).not.toMatch(/\bFollow\b/);
  });

  it('skips Official when the Home banner is missing and never retargets Lobby', () => {
    const official = TOUR_STEPS.find((step) => step.id === 'official');
    expect(official).toBeTruthy();
    expect(officialTourTarget(() => false)).toBeNull();
    expect(shouldSkipHomeStep(official!, () => false)).toBe(true);
    expect(homeTourTarget(official!, (id) => id === 'tour-tab-lobby')).toBeNull();
    expect(homeTourTarget(official!, (id) => id === 'tour-official-banner')).toBe(
      'tour-official-banner',
    );
  });

  it('keeps Rounds and falls back to the Waves rail when tour-rounds is missing', () => {
    const rounds = TOUR_STEPS.find((step) => step.id === 'rounds');
    expect(rounds).toBeTruthy();
    expect(shouldSkipHomeStep(rounds!, (id) => id === 'tour-waves')).toBe(false);
    expect(homeTourTarget(rounds!, (id) => id === 'tour-waves')).toBe('tour-waves');
    expect(homeTourBody(rounds!, (id) => id === 'tour-waves')).toBe(ROUNDS_FALLBACK_BODY);
    expect(ROUNDS_FALLBACK_BODY).toMatch(/Post → Round/);
  });

  it('advances past missing Official and lands on Waves', () => {
    const hasRect = (id: string) =>
      id !== 'tour-official-banner' && id !== 'tour-official' && id !== 'tour-rounds';
    const officialIndex = TOUR_STEPS.findIndex((step) => step.id === 'official');
    expect(nextHomeTourIndex(officialIndex - 1, 1, hasRect)).toBe(
      TOUR_STEPS.findIndex((step) => step.id === 'waves'),
    );
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
