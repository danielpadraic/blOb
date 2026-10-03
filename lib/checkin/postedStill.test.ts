import { describe, expect, it } from 'vitest';

import { postedStillNeed } from '@/lib/checkin/postedStill';

describe('posted still need', () => {
  it('names the open post selfie and workout', () => {
    expect(postedStillNeed(['Post-selfie', 'Workout'])).toBe(
      'Posted. Still need the post selfie and the workout.',
    );
  });
});
