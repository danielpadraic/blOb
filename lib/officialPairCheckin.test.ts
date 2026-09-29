import { describe, expect, it } from 'vitest';

import type { ChallengeProof } from '@/lib/challengeProofs';
import {
  mergeOfficialPairParts,
  ocrCheckinStats,
  orderedCheckinSlides,
  qualifyingSlotUrl,
  siblingOfficialChallengeId,
} from '@/lib/officialPairCheckin';

const PROOFS: ChallengeProof[] = [
  { id: 'pre', name: 'Pre-workout selfie', method: 'photo' },
  { id: 'post', name: 'Post-workout selfie', method: 'photo' },
  { id: 'hr', name: 'Heart rate', method: 'hr' },
];

const PRE = 'https://cdn.example/pre.jpg';
const PRE2 = 'https://cdn.example/pre-again.jpg';
const POST = 'https://cdn.example/post.jpg';
const HR = 'https://cdn.example/fitness.jpg';
const CARD = 'https://cdn.example/user/challenge/workout_card-12.jpg';

describe('official pair slots', () => {
  it('fills Monthly pre from Weekly and does not ask for a second pre', () => {
    const merged = mergeOfficialPairParts(
      PROOFS,
      { proof_parts: {} },
      {
        proof_parts: { pre: { method: 'photo', url: PRE, urls: [PRE] } },
        pre_selfie_url: PRE,
      },
    );
    expect(qualifyingSlotUrl(PROOFS[0], merged, null)).toBe(PRE);
    expect(merged.pre?.urls).toEqual([PRE]);
  });

  it('keeps one pre when Weekly already stored two', () => {
    const merged = mergeOfficialPairParts(
      PROOFS,
      { proof_parts: { pre: { method: 'photo', url: PRE, urls: [PRE, PRE2] } } },
      { proof_parts: { pre: { method: 'photo', url: PRE2, urls: [PRE2] } } },
    );
    expect(merged.pre?.url).toBe(PRE);
    expect(merged.pre?.urls).toEqual([PRE]);
  });

  it('orders both Lives as pre, post, HR, recap, extras', () => {
    const slides = orderedCheckinSlides({
      proofs: PROOFS,
      parts: {
        pre: { method: 'photo', url: PRE, urls: [PRE, PRE2] },
        post: { method: 'photo', url: POST, urls: [POST] },
        hr: { method: 'hr', url: HR, urls: [HR, CARD] },
      },
      extras: [PRE, 'https://cdn.example/extra.jpg'],
      recap: CARD,
    });
    expect(slides).toEqual([PRE, POST, HR, CARD, 'https://cdn.example/extra.jpg']);
  });

  it('points Weekly at Monthly and leaves Run 128 alone', () => {
    expect(
      siblingOfficialChallengeId('week', { weeklyId: 'week', monthlyId: 'month' }),
    ).toBe('month');
    expect(siblingOfficialChallengeId('run-128', { weeklyId: 'week', monthlyId: 'month' })).toBeNull();
  });

  it('builds chips from OCR numbers and skips a vendor workout', () => {
    expect(
      ocrCheckinStats({
        source: 'ocr',
        activityType: 'other',
        sourceName: 'Traditional Strength Training',
        durationSec: 35 * 60 + 12,
        avgHrBpm: 118,
      }),
    ).toMatchObject({ source: 'ocr', duration_sec: 2112, hr_avg: 118 });
    expect(
      ocrCheckinStats({
        source: 'healthkit',
        activityType: 'running',
        sourceName: 'Run',
        durationSec: 1800,
        avgHrBpm: 150,
      }),
    ).toBeNull();
  });
});
