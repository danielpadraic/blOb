import { describe, expect, it } from 'vitest';

import { COPY_TONE_OPTIONS, PROFILE_SETUP_TONE_OPTIONS, asCopyTone, profileSetupTone } from '@/lib/copy';
import { TOUR_STEPS } from '@/lib/tour';

describe('home tour copy', () => {
  it('has a Menu step on the hamburger and Quick Start on +', () => {
    const ids = TOUR_STEPS.map((step) => step.id);
    expect(ids).toEqual([
      'coins',
      'money',
      'search',
      'dm',
      'bell',
      'menu',
      'official',
      'waves',
      'rounds',
      'tabFeed',
      'tabLobby',
      'tabCreate',
      'tabFriends',
      'tabYou',
      'goal',
    ]);

    const menu = TOUR_STEPS.find((step) => step.id === 'menu');
    expect(menu).toMatchObject({
      target: 'tour-menu',
      placement: 'below',
      title: 'Menu',
      body: 'Create a Challenge, Create a Circle, Call someone out, Join, or Send Coins. These live here — not on the +.',
    });

    const create = TOUR_STEPS.find((step) => step.id === 'tabCreate');
    expect(create?.title).toBe('+');
    expect(create?.body).toBe(
      'Quick Start. Check In when you are in a challenge that needs proof. Post opens Wave, Round, or a Feed update.',
    );
    expect(TOUR_STEPS.some((step) => /simple or advanced/i.test(step.body))).toBe(false);

    const waves = TOUR_STEPS.find((step) => step.id === 'waves');
    expect(waves).toMatchObject({
      target: 'tour-waves',
      placement: 'below',
      title: 'Waves',
    });
    const rounds = TOUR_STEPS.find((step) => step.id === 'rounds');
    expect(rounds).toMatchObject({
      target: 'tour-waves',
      placement: 'below',
      title: 'Rounds',
    });
    expect(rounds?.body).toMatch(/Up to 3 minutes/);
    const friends = TOUR_STEPS.find((step) => step.id === 'tabFriends');
    expect(friends?.body).toMatch(/Circles are your standing crew/);
    expect(friends?.body).not.toMatch(/Neutral/i);
    expect(TOUR_STEPS.some((step) => /Neutral/i.test(step.body) || /Neutral/i.test(step.title))).toBe(
      false,
    );
  });

  it('maps Neutral tone to Gentle and only offers Gentle | Honest', () => {
    expect(asCopyTone('neutral')).toBe('gentle');
    expect(asCopyTone(null)).toBe('gentle');
    expect(asCopyTone(undefined)).toBe('gentle');
    expect(profileSetupTone('neutral')).toBe('gentle');
    expect(COPY_TONE_OPTIONS.map((option) => option.value)).toEqual(['gentle', 'honest']);
    expect(PROFILE_SETUP_TONE_OPTIONS.map((option) => option.value)).toEqual(['gentle', 'honest']);
  });
});
