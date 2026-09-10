import { afterEach, describe, expect, it } from 'vitest';

import {
  HOME_TOUR_COIN_SEED,
  clearHomeTourCompleted,
  headerCoinsForTour,
  isWalletReadyForHomeTour,
  markHomeTourCompleted,
  wasHomeTourCompleted,
} from '@/lib/homeTour';

describe('homeTour', () => {
  afterEach(() => {
    clearHomeTourCompleted('user-1');
    clearHomeTourCompleted('fresh-user');
  });

  it('treats Don’t show again the same as a completed flag for the session', () => {
    expect(wasHomeTourCompleted('user-1')).toBe(false);
    markHomeTourCompleted('user-1');
    expect(wasHomeTourCompleted('user-1')).toBe(true);
    expect(wasHomeTourCompleted('user-1', null)).toBe(true);
  });

  it('reads a persisted local dismiss before the profile row returns', () => {
    markHomeTourCompleted('user-1');
    expect(wasHomeTourCompleted('user-1', null)).toBe(true);
    if (typeof localStorage !== 'undefined') {
      expect(localStorage.getItem('blob:home-tour-dismissed:user-1')).toBe('1');
    }
  });

  it('still shows the tour when dismissed is null and nothing is stored', () => {
    expect(wasHomeTourCompleted('fresh-user', null)).toBe(false);
  });

  it('waits for a settled wallet and seeds the first-run header', () => {
    expect(isWalletReadyForHomeTour({ coins: 0, last_shown_coin_balance: null })).toBe(false);
    expect(isWalletReadyForHomeTour({ coins: 110, last_shown_coin_balance: null })).toBe(true);
    expect(headerCoinsForTour({ coins: 0, tutorial_completed_at: null })).toBe(HOME_TOUR_COIN_SEED);
    expect(headerCoinsForTour({ coins: 110, tutorial_completed_at: null })).toBe(110);
  });
});
