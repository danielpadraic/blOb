import { describe, expect, it } from 'vitest';

import { isUserScreenshotUrl, screenshotUrlsBeforeCard } from '@/lib/health/restoreScreenshotMedia';

const SHOT = 'https://cdn.test/walk.jpg?token=a';
const CARD = 'https://cdn.test/workout_card-9.jpg?token=b';

describe('screenshotUrlsBeforeCard', () => {
  it('puts the Fitness still first and the recap last', () => {
    expect(screenshotUrlsBeforeCard([CARD, SHOT])).toEqual([SHOT, CARD]);
  });

  it('dedups the same file signed twice', () => {
    expect(screenshotUrlsBeforeCard([SHOT, `${SHOT.split('?')[0]}?token=z`, CARD])).toEqual([
      SHOT,
      CARD,
    ]);
  });
});

describe('isUserScreenshotUrl', () => {
  it('treats jpeg / heic as the user still', () => {
    expect(isUserScreenshotUrl(SHOT)).toBe(true);
    expect(isUserScreenshotUrl('https://cdn.test/a.HEIC')).toBe(true);
    expect(isUserScreenshotUrl('https://cdn.test/notes.txt')).toBe(false);
  });
});
