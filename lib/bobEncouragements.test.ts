import { describe, expect, it } from 'vitest';

import { BOB_CATALOG } from '@/copy/bobCatalog.generated';
import {
  BOB_ENCOURAGEMENT_CATEGORIES,
  BOB_ENCOURAGEMENT_TONES,
  BOB_LINE_MAX,
  interpolateBobLine,
  pickBobLine,
} from '@/copy/bobEncouragements';

describe('Bob encouragement catalog', () => {
  it('ships only Gentle and Honest', () => {
    expect(BOB_ENCOURAGEMENT_TONES).toEqual(['gentle', 'honest']);
  });

  it('names the challenge and stays at or under 100', () => {
    const text = interpolateBobLine('Time to check in to {challenge}.', {
      challenge: 'Morning miles',
    });
    expect(text).toBe('Time to check in to Morning miles.');
    expect(text).not.toContain('Your Challenge:');
    expect(text.length).toBeLessThanOrEqual(BOB_LINE_MAX);
    expect(text.toLowerCase()).not.toMatch(/\bthe field\b/);
    expect(text.toLowerCase()).not.toMatch(/\bwindow\b/);
    expect(text.toLowerCase()).not.toMatch(/chicago/);
    expect(text).not.toMatch(/I believe/i);
  });

  it('truncates a long title so the push still fits', () => {
    const title = 'A'.repeat(80);
    const text = interpolateBobLine('Time to check in to {challenge}.', { challenge: title });
    expect(text.length).toBeLessThanOrEqual(BOB_LINE_MAX);
    expect(text).toContain('…');
    expect(text.startsWith('Time to check in to ')).toBe(true);
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
    expect(picked?.text).toBe('You missed a day on Daily sit-ups. You are still in.');
    expect(picked?.text).not.toContain('Your Challenge:');
    expect(picked?.text.length).toBeLessThanOrEqual(BOB_LINE_MAX);
  });

  it('ships one Gentle and one Honest line per category', () => {
    const longTitle = 'A'.repeat(80);
    for (const category of BOB_ENCOURAGEMENT_CATEGORIES) {
      const row = BOB_CATALOG[category];
      expect(row.gentle.length).toBeGreaterThan(0);
      expect(row.honest.length).toBeGreaterThan(0);
      for (const tone of BOB_ENCOURAGEMENT_TONES) {
        for (const template of row[tone]) {
          expect(template.toLowerCase()).not.toMatch(/show(?:ed|ing)? up/);
          expect(template.toLowerCase()).not.toMatch(/\bwindow\b/);
          expect(template.toLowerCase()).not.toMatch(/chicago|first open of the|i believe/);
          expect(template).toContain('{challenge}');
          expect(template).not.toMatch(/does not save you a seat|podium photos|people in fourth|will still like you/i);
          const text = interpolateBobLine(template, { n: 14, challenge: longTitle });
          expect(text, `${category} ${tone}: ${template}`).toBeTruthy();
          expect(text.length).toBeLessThanOrEqual(BOB_LINE_MAX);
        }
      }
    }
  });
});
