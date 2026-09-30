import { describe, expect, it } from 'vitest';

import { officialPeriodFullyProved } from '@/lib/checkin/officialDay';

describe('officialPeriodFullyProved', () => {
  it('counts a day only when pre, post, and the workout slot are filled', () => {
    expect(
      officialPeriodFullyProved({
        pre_selfie_url: 'https://cdn.example/pre.jpg',
        post_selfie_url: 'https://cdn.example/post.jpg',
        health_workout_id: 'hk-1',
      }),
    ).toBe(true);
    expect(
      officialPeriodFullyProved({
        proof_parts: { pre: { url: 'https://cdn.example/pre.jpg' } },
      }),
    ).toBe(false);
    expect(officialPeriodFullyProved(null)).toBe(false);
  });
});
