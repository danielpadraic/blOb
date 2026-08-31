import { describe, expect, it } from 'vitest';

import {
  officialFormingStartLine,
  officialRemainingToStart,
  officialStartJoinTarget,
} from '@/lib/officialSeries';

describe('Official forming copy', () => {
  it('names midnight Chicago and remaining on this id only', () => {
    const row = {
      id: 'official-1',
      is_official: true,
      series_id: 'week_10',
      status: 'filling',
      min_participants: 10,
      participant_count: 3,
      host_budget: 0,
      prize_pool: 30,
      buy_in_amount: 10,
    };
    expect(officialStartJoinTarget(row)).toBe(10);
    expect(officialRemainingToStart(row)).toBe(7);
    expect(officialFormingStartLine(row)).toBe('Starts at midnight Chicago when 10 have joined.');
    expect(
      officialFormingStartLine({
        ...row,
        id: '',
      }),
    ).toBeNull();
  });
});
