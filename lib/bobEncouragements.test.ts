import { describe, expect, it } from 'vitest';

import {
  BOB_ENCOURAGEMENT_TONES,
  BOB_LINE_MAX,
  interpolateBobLine,
  pickBobLine,
} from '@/copy/bobEncouragements';

describe('Bob encouragement catalog', () => {
  it('ships only Gentle and Honest', () => {
    expect(BOB_ENCOURAGEMENT_TONES).toEqual(['gentle', 'honest']);
  });

  it('names the challenge and stays at or under 140', () => {
    const text = interpolateBobLine('You missed a check-in. You are still in. Today still counts.', {
      challenge: 'Morning miles',
    });
    expect(text).toContain('Morning miles');
    expect(text.length).toBeLessThanOrEqual(BOB_LINE_MAX);
    expect(text.toLowerCase()).not.toMatch(/\bthe field\b/);
  });

  it('truncates a long title so the push still fits', () => {
    const title = 'A'.repeat(80);
    const text = interpolateBobLine(
      'Removed from {challenge}. Entry fees stay. Next Official week is open.',
      { challenge: title },
    );
    expect(text.length).toBeLessThanOrEqual(BOB_LINE_MAX);
    expect(text).toContain('…');
  });

  it('does not pick a line without a challenge name', () => {
    expect(
      pickBobLine({
        category: 'miss_still_in',
        tone: 'neutral',
        challenge: '',
      }),
    ).toBeNull();
  });

  it('maps Neutral to Gentle and names the challenge', () => {
    const picked = pickBobLine({
      category: 'miss_still_in',
      tone: 'neutral',
      challenge: 'Daily sit-ups',
    });
    expect(picked?.text).toContain('Daily sit-ups');
    expect(picked?.text.length).toBeLessThanOrEqual(BOB_LINE_MAX);
  });
});
