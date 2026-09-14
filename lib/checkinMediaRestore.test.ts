import { describe, expect, it } from 'vitest';

import {
  mediaUrlsFromProofParts,
  restoreCheckinMediaUrls,
  vendorCardUrlFromProofParts,
} from '@/lib/checkinMediaRestore';
import { mediaUrlsForPost } from '@/lib/postMediaCarousel';

const SELFIE = 'https://cdn.test/pre_selfie-1.jpg';
const SELFIE2 = 'https://cdn.test/post_selfie-2.jpg';
const SHOT = 'https://cdn.test/fitness-screenshot.jpg';
const CARD = 'https://cdn.test/user/c/workout_card-9.jpg';

const WALK = {
  duration_sec: 2215,
  active_cal: 218,
  hr_avg: 87,
  distance_m: 2188,
};

describe('restoreCheckinMediaUrls', () => {
  it('unions Home stills onto an empty Live row and appends the recap last', () => {
    const next = restoreCheckinMediaUrls({
      mediaUrls: [],
      homeMediaUrls: [SELFIE, SELFIE2, CARD],
      stats: { ...WALK, card_url: CARD },
    });
    expect(next.media_urls).toEqual([SELFIE, SELFIE2, CARD]);
    expect(mediaUrlsForPost({ urls: next.media_urls, stats: next.checkin_stats })).toEqual([
      SELFIE,
      SELFIE2,
      CARD,
    ]);
  });

  it('puts original screenshots back beside a card-only post', () => {
    const next = restoreCheckinMediaUrls({
      mediaUrls: [CARD],
      proofPartUrls: [SHOT, SELFIE, CARD],
      stats: { ...WALK, card_url: CARD },
    });
    expect(next.media_urls).toEqual([SHOT, SELFIE, CARD]);
  });

  it('never drops user stills when a stats write only carried the card', () => {
    const next = restoreCheckinMediaUrls({
      mediaUrls: [SELFIE, SHOT],
      homeMediaUrls: [CARD],
      stats: { ...WALK, card_url: CARD },
    });
    expect(next.media_urls).toEqual([SELFIE, SHOT, CARD]);
  });

  it('does not invent a recap for OCR numbers with no vendor JPEG', () => {
    const next = restoreCheckinMediaUrls({
      mediaUrls: [SHOT],
      stats: WALK,
    });
    expect(next.media_urls).toEqual([SHOT]);
  });

  it('Home and Live helpers return the same order for the same inputs', () => {
    const restored = restoreCheckinMediaUrls({
      mediaUrls: [CARD, SELFIE],
      homeMediaUrls: [SELFIE, SHOT],
      stats: { ...WALK, card_url: CARD },
    });
    expect(mediaUrlsForPost({ urls: restored.media_urls, stats: restored.checkin_stats })).toEqual(
      restored.media_urls,
    );
    expect(restored.media_urls[restored.media_urls.length - 1]).toBe(CARD);
    expect(restored.media_urls).toContain(SELFIE);
    expect(restored.media_urls).toContain(SHOT);
  });
});

describe('mediaUrlsFromProofParts', () => {
  it('reads slot urls and legacy selfie columns', () => {
    expect(
      mediaUrlsFromProofParts(
        {
          pre: { method: 'photo', url: SELFIE, urls: [SELFIE] },
          hr: { method: 'hr', url: SHOT, urls: [SHOT, CARD] },
        },
        { post_selfie_url: SELFIE2 },
      ),
    ).toEqual([SELFIE, SHOT, CARD, SELFIE2]);
  });

  it('names a vendor recap from a HealthKit slot', () => {
    expect(
      vendorCardUrlFromProofParts({
        hr: {
          method: 'hr',
          url: CARD,
          urls: [SHOT, CARD],
          healthWorkoutId: 'w-1',
          health: { source: 'healthkit', activityType: 'walking', sourceName: 'Apple Watch' },
        },
      }),
    ).toBe(CARD);
  });
});
