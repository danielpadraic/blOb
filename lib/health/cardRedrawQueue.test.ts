import { beforeEach, describe, expect, it, vi } from 'vitest';

const rows = vi.hoisted(() => ({ data: [] as unknown[] }));

vi.mock('@/lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  for (const name of ['select', 'eq', 'not', 'order', 'in']) {
    chain[name] = () => chain;
  }
  chain.limit = async () => ({ data: rows.data, error: null });
  chain.then = undefined;
  return { supabase: { from: () => chain, auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } } };
});
vi.mock('@/utils/upload', () => ({
  challengeProofUrl: async (path: string) => path,
  uploadChallengeProof: async () => 'path',
}));
vi.mock('@/lib/health/appendWorkoutCard', () => ({ appendWorkoutCardUrl: async () => null }));

import { beginCardInflight, endCardInflight, resetCardInflightForTests } from '@/lib/health/cardInflight';
import { pendingCardRepairs } from '@/lib/health/cardRedrawQueue';

const part = {
  method: 'hr',
  url: 'https://cdn.test/u/c/hr_monitor-1.jpg',
  urls: ['https://cdn.test/u/c/hr_monitor-1.jpg'],
  healthWorkoutId: 'w1',
  health: {
    source: 'healthkit',
    startedAt: '2026-09-01T10:00:00Z',
    endedAt: '2026-09-01T10:30:00Z',
    durationSec: 1800,
    activityType: 'running',
    sourceName: 'Apple Watch',
  },
};

describe('pendingCardRepairs', () => {
  beforeEach(() => {
    resetCardInflightForTests();
    rows.data = [{ id: 'k1', challenge_id: 'c1', proof_parts: { s: part } }];
  });

  it('draws a card the check-in is missing', async () => {
    expect((await pendingCardRepairs('u1')).map((item) => item.checkinId)).toEqual(['k1']);
  });

  it('skips a check-in whose card is already being drawn or uploaded elsewhere', async () => {
    beginCardInflight('k1');
    expect(await pendingCardRepairs('u1')).toEqual([]);
    endCardInflight('k1');
    expect((await pendingCardRepairs('u1')).length).toBe(1);
  });
});
