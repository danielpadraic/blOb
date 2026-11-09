import { describe, expect, it } from 'vitest';

import type { ChallengeProof } from '@/lib/challengeProofs';
import {
  mergeOfficialPairParts,
  officialPairPending,
  ocrCheckinStats,
  orderedCheckinSlides,
  qualifyingSlotUrl,
  collapseDualStampHomePosts,
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
    expect(slides).toEqual([PRE, POST, HR, 'https://cdn.example/extra.jpg', CARD]);
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

describe('collapseDualStampHomePosts', () => {
  it('keeps the oldest Home row and names both Official rooms', () => {
    const rows = collapseDualStampHomePosts([
      {
        id: 'newer',
        author_id: 'dan',
        created_at: '2026-09-30T15:00:02.000Z',
        source: 'checkin',
        challenge_id: 'month',
        media_urls: ['https://cdn.example/post.jpg'],
      },
      {
        id: 'older',
        author_id: 'dan',
        created_at: '2026-09-30T15:00:01.000Z',
        source: 'checkin',
        challenge_id: 'week',
        media_urls: ['https://cdn.example/pre.jpg', 'https://cdn.example/post.jpg'],
      },
      {
        id: 'other',
        author_id: 'sam',
        created_at: '2026-09-30T15:00:01.000Z',
        source: 'checkin',
        challenge_id: 'hobby',
        media_urls: ['https://cdn.example/hobby.jpg'],
      },
    ]);
    expect(rows.map((row) => row.id)).toEqual(['older', 'other']);
    expect(rows[0]?.media_urls).toEqual(['https://cdn.example/pre.jpg', 'https://cdn.example/post.jpg']);
    expect(rows[0]?.checkin_stats?.paired_challenge_ids).toEqual(['week', 'month']);
  });
});

describe('officialPairPending', () => {
  const base = {
    officialCoin: true,
    roomsLoading: false,
    siblingChallengeId: 'monthly',
    siblingEnabled: true,
    siblingFetched: true,
  };

  it('does not gate non-Official check-ins', () => {
    expect(officialPairPending({ ...base, officialCoin: false, roomsLoading: true })).toBe(false);
  });

  it('waits for the Official rooms before the camera can ask for a pre selfie', () => {
    expect(officialPairPending({ ...base, roomsLoading: true, siblingChallengeId: null })).toBe(true);
  });

  it('waits for the sibling check-in, then releases', () => {
    expect(officialPairPending({ ...base, siblingFetched: false })).toBe(true);
    expect(officialPairPending(base)).toBe(false);
  });

  it('never blocks when the sibling query is off', () => {
    expect(officialPairPending({ ...base, siblingEnabled: false, siblingFetched: false })).toBe(false);
    expect(officialPairPending({ ...base, siblingChallengeId: null, siblingFetched: false })).toBe(false);
  });
});
