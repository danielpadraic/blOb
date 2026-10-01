import { describe, expect, it } from 'vitest';

import { mediaWithExtraCard, proofPartWithExtraCard } from '@/lib/health/workoutCardSlide';

const SHOT = 'https://cdn.test/u/c/hr_monitor-1.jpg';
const PRE = 'https://cdn.test/u/c/pre_selfie-1.jpg';
const CARD = 'https://cdn.test/u/c/workout_card-9.jpg';
const OLD = 'https://cdn.test/u/c/workout_card-1.jpg';

describe('a workout card is an extra slide', () => {
  it('keeps a screenshot as the slot image and appends the recap', () => {
    const next = proofPartWithExtraCard({ url: SHOT, urls: [SHOT], method: 'hr' }, CARD, 3);
    expect(next.url).toBe(SHOT);
    expect(next.urls).toEqual([SHOT, CARD]);
    expect(next.cardVersion).toBe(3);
  });

  it('uses the recap as the slot image only when the slot had no still', () => {
    const next = proofPartWithExtraCard({ url: '', method: 'hr' }, CARD, 3);
    expect(next.url).toBe(CARD);
    expect(next.urls).toEqual([CARD]);
  });

  it('replaces an older recap file and leaves the selfies', () => {
    expect(mediaWithExtraCard([PRE, SHOT, OLD], CARD)).toEqual([PRE, SHOT, CARD]);
  });
});
