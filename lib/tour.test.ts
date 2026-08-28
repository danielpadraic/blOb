import { describe, expect, it } from 'vitest';

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
      body: 'Create a Challenge, Call someone out, Join, or Send Coins. These live here — not on the +.',
    });

    const create = TOUR_STEPS.find((step) => step.id === 'tabCreate');
    expect(create?.title).toBe('+');
    expect(create?.body).toBe(
      'Quick Start. Check In when you are in a challenge that needs proof. Post opens Wave, Round, or a Feed update.',
    );
    expect(TOUR_STEPS.some((step) => /simple or advanced/i.test(step.body))).toBe(false);
  });
});
