import { describe, expect, it } from 'vitest';

import { officialPeriodCounts, officialPeriodFullyProved } from '@/lib/checkin/officialDay';

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

  it('counts a ready Health workout of at least 30 minutes, and not a selfie pair alone', () => {
    expect(
      officialPeriodCounts({
        proof_parts: {
          pre: { url: 'https://cdn.example/pre.jpg' },
          post: { url: 'https://cdn.example/post.jpg' },
          hr: {
            health: {
              source: 'healthkit',
              activityType: 'strength',
              sourceName: 'Apple Watch',
              startedAt: '2026-09-30T11:33:36.398Z',
              endedAt: '2026-09-30T12:30:01.015Z',
              durationSec: 3385,
              avgHrBpm: 142,
            },
          },
        },
      }),
    ).toBe(true);
    expect(
      officialPeriodCounts({
        proof_parts: {
          pre: { url: 'https://cdn.example/pre.jpg' },
          post: { url: 'https://cdn.example/post.jpg' },
        },
      }),
    ).toBe(false);
  });
});
