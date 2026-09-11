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
  nextHomeTourIndex,
  officialTourTarget,
  ROUNDS_FALLBACK_BODY,
  shouldSkipHomeStep,
  TOUR_STEPS,
} from '@/lib/tour';

describe('home tour copy', () => {
  it('walks hamburger, wallet, banner, waves, +, Post, Friends, and You — not Live or Lobby', () => {
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
      'plusPost',
      'tabFriends',
      'tabYou',
    ]);
    expect(ids).toHaveLength(13);
    expect(ids).not.toContain('tabFeed');
    expect(ids).not.toContain('tabLobby');
    expect(ids).not.toContain('goal');

    const menu = TOUR_STEPS.find((step) => step.id === 'menu');
    expect(menu).toMatchObject({
      target: 'tour-menu-list',
      title: 'This menu',
    });
    expect(menu?.body).toMatch(/Create Challenge/);
    expect(menu?.body).toMatch(/Create a Circle/);
    expect(menu?.body).toMatch(/Call Someone Out/);
    expect(menu?.body).toMatch(/focus group/);
    expect(menu?.body).not.toMatch(/prize/);
    expect(menu?.body).not.toMatch(/A Circle is not a contest/);
    expect(menu?.body).not.toMatch(/has no prize money/);

    const create = TOUR_STEPS.find((step) => step.id === 'tabCreate');
    expect(create?.title).toBe('+');
    expect(create?.body).toMatch(/How you compete/);
    expect(create?.body).toMatch(/leaderboard/);
    expect(create?.body).toMatch(/Wave/);
    expect(create?.body).not.toMatch(/Create Challenge/);

    const plusPost = TOUR_STEPS.find((step) => step.id === 'plusPost');
    expect(plusPost?.title).toBe('Post');
    expect(plusPost?.body).toMatch(/Wave/);
    expect(plusPost?.body).toMatch(/Round/);
    expect(plusPost?.body).toMatch(/Feed/);

    const official = TOUR_STEPS.find((step) => step.id === 'official');
    expect(official?.target).toBe('tour-official-banner');
    expect(official?.target).not.toBe('tour-tab-lobby');
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

  it('opens the logo menu and + sheet only on those steps', () => {
    expect(homeTourChrome('menu')).toEqual({ logoMenu: true, plusSheet: null });
    expect(homeTourChrome('tabCreate')).toEqual({ logoMenu: false, plusSheet: 'root' });
    expect(homeTourChrome('plusPost')).toEqual({ logoMenu: false, plusSheet: 'post' });
    expect(homeTourChrome('coins')).toEqual({ logoMenu: false, plusSheet: null });
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

  it('never skips menu or + while the sheet is still measuring', () => {
    const menu = TOUR_STEPS.find((step) => step.id === 'menu');
    const create = TOUR_STEPS.find((step) => step.id === 'tabCreate');
    const plusPost = TOUR_STEPS.find((step) => step.id === 'plusPost');
    expect(shouldSkipHomeStep(menu!, () => false)).toBe(false);
    expect(shouldSkipHomeStep(create!, () => false)).toBe(false);
    expect(shouldSkipHomeStep(plusPost!, () => false)).toBe(false);
    expect(homeTourTarget(menu!, (id) => id === 'tour-menu-list')).toBe('tour-menu-list');
    expect(homeTourTarget(menu!, (id) => id === 'tour-menu')).toBe('tour-menu');
    expect(homeTourTarget(create!, (id) => id === 'tour-plus-root')).toBe('tour-plus-root');
    expect(homeTourTarget(plusPost!, (id) => id === 'tour-plus-post')).toBe('tour-plus-post');
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
