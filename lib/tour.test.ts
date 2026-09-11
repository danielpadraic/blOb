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
  homeTourTarget,
  isHomeTourLogoMenuStep,
  isHomeTourPlusPostStep,
  isHomeTourPlusRootStep,
  nextHomeTourIndex,
  officialTourTarget,
  ROUNDS_FALLBACK_BODY,
  shouldSkipHomeStep,
  TOUR_STEPS,
} from '@/lib/tour';

describe('home tour copy', () => {
  it('walks one hamburger row, wallet, banner, waves, each + button, Post items, Friends, and You', () => {
    const ids = TOUR_STEPS.map((step) => step.id);
    expect(ids).toEqual([
      'menuChallenge',
      'menuCircle',
      'menuCallout',
      'menuJoin',
      'menuSendCoins',
      'coins',
      'money',
      'search',
      'dm',
      'bell',
      'official',
      'waves',
      'rounds',
      'plusCheckIn',
      'plusPost',
      'plusLift',
      'plusTimer',
      'plusWave',
      'plusRound',
      'plusFeed',
      'tabFriends',
      'tabYou',
    ]);
    expect(ids).not.toContain('tabFeed');
    expect(ids).not.toContain('tabLobby');
    expect(ids).not.toContain('menu');
    expect(ids).not.toContain('tabCreate');

    const menu = TOUR_STEPS.filter((step) => isHomeTourLogoMenuStep(step.id));
    expect(menu.map((step) => step.target)).toEqual([
      'tour-menu-challenge',
      'tour-menu-circle',
      'tour-menu-callout',
      'tour-menu-join',
      'tour-menu-coins',
    ]);
    expect(menu.every((step) => !step.body.includes('\n'))).toBe(true);
    expect(menu[0]).toMatchObject({ title: 'Create Challenge' });
    expect(menu[1]?.body).toMatch(/focus group/);
    expect(menu[4]?.title).toBe('Send Coins');
    expect(menu[4]?.body).toMatch(/not cash/);

    const plusRoot = TOUR_STEPS.filter((step) => isHomeTourPlusRootStep(step.id));
    expect(plusRoot.map((step) => [step.id, step.target, step.placement])).toEqual([
      ['plusCheckIn', 'tour-plus-checkin', 'above'],
      ['plusPost', 'tour-plus-post-btn', 'above'],
      ['plusLift', 'tour-plus-lift', 'above'],
      ['plusTimer', 'tour-plus-timer', 'above'],
    ]);
    expect(plusRoot.every((step) => !step.body.includes('\n'))).toBe(true);

    const plusPost = TOUR_STEPS.filter((step) => isHomeTourPlusPostStep(step.id));
    expect(plusPost.map((step) => step.id)).toEqual(['plusWave', 'plusRound', 'plusFeed']);
    expect(plusPost.every((step) => !step.body.includes('\n'))).toBe(true);

    const official = TOUR_STEPS.find((step) => step.id === 'official');
    expect(official?.target).toBe('tour-official-banner');
    expect(official?.body).toMatch(/Bob/);

    const you = TOUR_STEPS.find((step) => step.id === 'tabYou');
    expect(you?.body).toMatch(/Settings/);
    expect(you?.body).toMatch(/replay this tour/);

    const joined = TOUR_STEPS.map((step) => `${step.title} ${step.body}`).join('\n');
    expect(joined).not.toMatch(/Bucks/i);
    expect(joined).not.toMatch(/I believe/i);
    expect(joined).not.toMatch(/\bFollow\b/);
    expect(joined).not.toMatch(/Featured Challenge Rounds/);
  });

  it('opens the logo menu for all five hamburger steps and the + sheet for root vs Post', () => {
    expect(homeTourChrome('menuChallenge')).toEqual({ logoMenu: true, plusSheet: null });
    expect(homeTourChrome('menuCircle')).toEqual({ logoMenu: true, plusSheet: null });
    expect(homeTourChrome('menuCallout')).toEqual({ logoMenu: true, plusSheet: null });
    expect(homeTourChrome('menuJoin')).toEqual({ logoMenu: true, plusSheet: null });
    expect(homeTourChrome('menuSendCoins')).toEqual({ logoMenu: true, plusSheet: null });
    expect(homeTourChrome('plusCheckIn')).toEqual({ logoMenu: false, plusSheet: 'root' });
    expect(homeTourChrome('plusPost')).toEqual({ logoMenu: false, plusSheet: 'root' });
    expect(homeTourChrome('plusLift')).toEqual({ logoMenu: false, plusSheet: 'root' });
    expect(homeTourChrome('plusTimer')).toEqual({ logoMenu: false, plusSheet: 'root' });
    expect(homeTourChrome('plusWave')).toEqual({ logoMenu: false, plusSheet: 'post' });
    expect(homeTourChrome('plusRound')).toEqual({ logoMenu: false, plusSheet: 'post' });
    expect(homeTourChrome('plusFeed')).toEqual({ logoMenu: false, plusSheet: 'post' });
    expect(homeTourChrome('coins')).toEqual({ logoMenu: false, plusSheet: null });
    expect(homeTourChrome('waves')).toEqual({ logoMenu: false, plusSheet: null });
    expect(homeTourChrome('tabFriends')).toEqual({ logoMenu: false, plusSheet: null });
    expect(homeTourChrome(null)).toEqual({ logoMenu: false, plusSheet: null });
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
    expect(ROUNDS_FALLBACK_BODY).toMatch(/Post/);
    expect(ROUNDS_FALLBACK_BODY).toMatch(/Round/);
  });

  it('never skips hamburger or + while chrome is still opening, and never holes Waves for a menu row', () => {
    const challenge = TOUR_STEPS.find((step) => step.id === 'menuChallenge');
    const checkIn = TOUR_STEPS.find((step) => step.id === 'plusCheckIn');
    const wave = TOUR_STEPS.find((step) => step.id === 'plusWave');
    expect(shouldSkipHomeStep(challenge!, () => false)).toBe(false);
    expect(shouldSkipHomeStep(checkIn!, () => false)).toBe(false);
    expect(shouldSkipHomeStep(wave!, () => false)).toBe(false);
    expect(homeTourTarget(challenge!, (id) => id === 'tour-waves' || id === 'tour-menu-list')).toBe(
      'tour-menu-challenge',
    );
    expect(homeTourTarget(checkIn!, (id) => id === 'tour-waves')).toBe('tour-plus-checkin');
    expect(
      shouldSkipHomeStep(challenge!, (id) => id === 'tour-menu-list' || id === 'tour-menu-circle'),
    ).toBe(true);
    expect(
      shouldSkipHomeStep(challenge!, (id) => id === 'tour-menu-list' || id === 'tour-menu-challenge'),
    ).toBe(false);
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
