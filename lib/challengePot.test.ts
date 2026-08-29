import { describe, expect, it } from 'vitest';

import { displayChallengePot } from '@/lib/challengePot';

describe('displayChallengePot', () => {
  it('uses challenges.prize_pool while live', () => {
    expect(displayChallengePot({ status: 'live', prize_pool: 40, host_budget: 10 })).toBe(40);
  });

  it('reads the settlement pot after settle, not the zeroed prize_pool', () => {
    expect(
      displayChallengePot({
        status: 'settled',
        prize_pool: 0,
        settled_prize_pool: 40,
        host_budget: 10,
      }),
    ).toBe(40);
    expect(
      displayChallengePot({
        status: 'ended',
        prize_pool: 0,
        settled_prize_pool: 25,
      }),
    ).toBe(25);
    expect(
      displayChallengePot({
        status: 'settled',
        prize_pool: 0,
        settled_prize_pool: 20,
      }),
    ).toBe(20);
  });

  it('uses live prize_pool while ended or settling if settlement is missing', () => {
    expect(
      displayChallengePot({
        status: 'settling',
        prize_pool: 40,
        host_budget: 10,
      }),
    ).toBe(40);
    expect(
      displayChallengePot({
        status: 'ended',
        prize_pool: 18,
      }),
    ).toBe(18);
  });

  it('falls back to host_budget when settlement is missing and prize_pool is 0', () => {
    expect(
      displayChallengePot({
        status: 'settled',
        prize_pool: 0,
        host_budget: 25,
      }),
    ).toBe(25);
    expect(
      displayChallengePot({
        status: 'settled',
        prize_pool: 0,
        settled_prize_pool: 0,
        host_budget: 35,
      }),
    ).toBe(35);
  });

  it('shows 0 only when the challenge was actually free', () => {
    expect(
      displayChallengePot({
        status: 'settled',
        prize_pool: 0,
        host_budget: 0,
        buy_in_amount: 0,
      }),
    ).toBe(0);
  });
});
