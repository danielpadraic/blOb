import { describe, expect, it } from 'vitest';

import { normalizeChallenge } from '@/lib/challenges';
import {
  isOfficialCoinChallenge,
  officialCoinAllowedDays,
  officialCoinBoardHeaderLine,
  officialCoinDaysLeft,
  officialCoinGuarantee,
  officialCoinKind,
  officialCoinMidWindowLine,
  officialCoinPickerRank,
  officialCoinRoomIds,
  officialCoinRulesParagraph,
  officialCoinScoreLabel,
  officialCoinWindowBounds,
  officialCoinWindowDays,
} from '@/lib/officialCoin';

// Friday Sep 25 2026, 12:59pm Chicago.
const FRIDAY = new Date('2026-09-25T17:59:00.000Z');

const WEEKLY = {
  id: 'weekly-id',
  title: 'Official Weekly Coin',
  official_kind: 'coin_weekly',
  window_reset: 'weekly_chicago',
  score_mode: 'count_days',
  prize_guarantee_coins: 100,
  days_required: 7,
  starts_at: '2026-09-21T05:00:00.000Z',
  ends_at: '2026-09-28T05:00:00.000Z',
};

const MONTHLY = {
  id: 'monthly-id',
  title: 'Official Monthly Coin',
  official_kind: 'coin_monthly',
  window_reset: 'monthly_chicago',
  score_mode: 'count_days',
  prize_guarantee_coins: 1000,
  days_required: 30,
  starts_at: '2026-09-01T05:00:00.000Z',
  ends_at: '2026-10-01T05:00:00.000Z',
};

describe('officialCoinKind', () => {
  it('reads only the two house rooms', () => {
    expect(officialCoinKind(WEEKLY)).toBe('coin_weekly');
    expect(officialCoinKind(MONTHLY)).toBe('coin_monthly');
    expect(officialCoinKind({ official_kind: 'week_10' })).toBeNull();
    expect(isOfficialCoinChallenge({ id: 'x' })).toBe(false);
  });
});

describe('officialCoinWindowBounds', () => {
  it('opens the weekly window on Chicago Monday and closes after Sunday', () => {
    const w = officialCoinWindowBounds('coin_weekly', FRIDAY);
    expect(w.startKey).toBe('2026-09-21');
    expect(w.endKey).toBe('2026-09-28');
    expect(w.days).toBe(7);
  });

  it('treats Sunday as the last day of that same week, not a new one', () => {
    // Sunday Sep 27 2026, 8pm Chicago.
    const sunday = officialCoinWindowBounds('coin_weekly', new Date('2026-09-28T01:00:00.000Z'));
    expect(sunday.startKey).toBe('2026-09-21');
    expect(sunday.endKey).toBe('2026-09-28');
  });

  it('rolls the week at Chicago midnight Monday, not UTC midnight', () => {
    // 04:59 UTC Monday is still 11:59pm Sunday in Chicago.
    expect(officialCoinWindowBounds('coin_weekly', new Date('2026-09-28T04:59:00.000Z')).startKey).toBe(
      '2026-09-21',
    );
    expect(officialCoinWindowBounds('coin_weekly', new Date('2026-09-28T05:01:00.000Z')).startKey).toBe(
      '2026-09-28',
    );
  });

  it('spans the whole Chicago month and wraps December into January', () => {
    const sep = officialCoinWindowBounds('coin_monthly', FRIDAY);
    expect(sep.startKey).toBe('2026-09-01');
    expect(sep.endKey).toBe('2026-10-01');
    expect(sep.days).toBe(30);

    const dec = officialCoinWindowBounds('coin_monthly', new Date('2026-12-14T18:00:00.000Z'));
    expect(dec.startKey).toBe('2026-12-01');
    expect(dec.endKey).toBe('2027-01-01');
    expect(dec.days).toBe(31);
  });

  it('counts February correctly', () => {
    const feb = officialCoinWindowBounds('coin_monthly', new Date('2028-02-10T18:00:00.000Z'));
    expect(feb.days).toBe(29);
  });
});

describe('officialCoinWindowDays', () => {
  it('reads the stored window, not a hardcoded 7 or 30', () => {
    expect(officialCoinWindowDays(WEEKLY, FRIDAY)).toBe(7);
    expect(officialCoinWindowDays(MONTHLY, FRIDAY)).toBe(30);
  });
});

describe('officialCoinAllowedDays', () => {
  it('gives a full window to someone who was there on day one', () => {
    expect(
      officialCoinAllowedDays(WEEKLY, { window_starts_at: WEEKLY.starts_at }, FRIDAY),
    ).toBe(7);
  });

  it('caps a Thursday join at the 4 days that are left', () => {
    // Thursday Sep 24 2026 in Chicago.
    expect(
      officialCoinAllowedDays(WEEKLY, { window_starts_at: '2026-09-24T15:00:00.000Z' }, FRIDAY),
    ).toBe(4);
  });

  it('caps a Friday mid-week backfill at 3', () => {
    expect(
      officialCoinAllowedDays(WEEKLY, { window_starts_at: '2026-09-25T17:59:33.000Z' }, FRIDAY),
    ).toBe(3);
  });

  it('caps a Friday backfill on the monthly room at 6', () => {
    expect(
      officialCoinAllowedDays(MONTHLY, { window_starts_at: '2026-09-25T17:59:33.000Z' }, FRIDAY),
    ).toBe(6);
  });

  it('never exceeds the window when the membership predates it', () => {
    expect(
      officialCoinAllowedDays(WEEKLY, { window_starts_at: '2026-01-01T00:00:00.000Z' }, FRIDAY),
    ).toBe(7);
  });

  it('is zero for anything that is not an Official Coin room', () => {
    expect(officialCoinAllowedDays({ id: 'x' }, { window_starts_at: WEEKLY.starts_at }, FRIDAY)).toBe(0);
  });
});

describe('officialCoinDaysLeft', () => {
  it('counts today as still open', () => {
    expect(officialCoinDaysLeft(WEEKLY, FRIDAY)).toBe(3);
    expect(officialCoinDaysLeft(MONTHLY, FRIDAY)).toBe(6);
  });
});

describe('officialCoinScoreLabel', () => {
  it('reads n of X', () => {
    expect(officialCoinScoreLabel(3, 7)).toBe('3 of 7');
    expect(officialCoinScoreLabel(0, 30)).toBe('0 of 30');
  });
});

describe('officialCoinBoardHeaderLine', () => {
  it('states the prize and days left, never Remaining / Caught Up / Dropped', () => {
    const weekly = officialCoinBoardHeaderLine(WEEKLY, FRIDAY);
    expect(weekly).toBe('Prize 100 coins · 3 days left this week');
    expect(officialCoinBoardHeaderLine(MONTHLY, FRIDAY)).toBe(
      'Prize 1,000 coins · 6 days left this month',
    );
    for (const banned of ['Remaining', 'Caught Up', 'Dropped', '50 ×', 'settlement']) {
      expect(weekly).not.toContain(banned);
    }
  });
});

describe('officialCoinRulesParagraph', () => {
  it('uses the locked weekly wording', () => {
    expect(officialCoinRulesParagraph(WEEKLY)).toBe(
      'Log a workout each Chicago day this week. When Sunday ends, 100 coins split by days logged. ' +
        'Joining mid-week means you can only log the days left. Misses do not drop you.',
    );
  });

  it('uses the locked monthly wording', () => {
    expect(officialCoinRulesParagraph(MONTHLY)).toBe(
      'Log a workout each Chicago day this month. When the month ends, 1,000 coins split by days logged. ' +
        'Joining mid-month means you can only log the days left. Misses do not drop you.',
    );
  });

  it('never says CST or names a settlement amount later', () => {
    const both = officialCoinRulesParagraph(WEEKLY) + officialCoinRulesParagraph(MONTHLY);
    expect(both).not.toContain('CST');
    expect(both).not.toContain('determined at settlement');
  });
});

describe('officialCoinMidWindowLine', () => {
  it('explains a short window and stays quiet on a full one', () => {
    expect(
      officialCoinMidWindowLine(WEEKLY, { window_starts_at: '2026-09-25T17:59:33.000Z' }, FRIDAY),
    ).toBe('You joined mid-week, so 3 of 7 days are still open to you.');
    expect(officialCoinMidWindowLine(WEEKLY, { window_starts_at: WEEKLY.starts_at }, FRIDAY)).toBe('');
  });
});

describe('officialCoinGuarantee', () => {
  it('prefers the stored column and falls back to the product lock', () => {
    expect(officialCoinGuarantee(WEEKLY)).toBe(100);
    expect(officialCoinGuarantee(MONTHLY)).toBe(1000);
    expect(officialCoinGuarantee({ official_kind: 'coin_weekly' })).toBe(100);
    expect(officialCoinGuarantee({ id: 'x' })).toBe(0);
  });
});

describe('normalizeChallenge', () => {
  it('carries the Official Coin columns through, so the Board and Overview can branch', () => {
    const row = normalizeChallenge({
      id: 'weekly-id',
      title: 'Official Weekly Coin',
      status: 'live',
      is_official: true,
      official_kind: 'coin_weekly',
      score_mode: 'count_days',
      window_reset: 'weekly_chicago',
      prize_guarantee_coins: 100,
      starts_at: WEEKLY.starts_at,
      ends_at: WEEKLY.ends_at,
      days_required: 7,
    });
    expect(row.official_kind).toBe('coin_weekly');
    expect(row.score_mode).toBe('count_days');
    expect(row.window_reset).toBe('weekly_chicago');
    expect(row.prize_guarantee_coins).toBe(100);
    expect(isOfficialCoinChallenge(row)).toBe(true);
    expect(officialCoinGuarantee(row)).toBe(100);
  });

  it('leaves every other challenge untouched', () => {
    const row = normalizeChallenge({ id: 'x', title: '30-Day Consistency', status: 'live' });
    expect(row.official_kind).toBeNull();
    expect(isOfficialCoinChallenge(row)).toBe(false);
  });
});

describe('picker order', () => {
  it('puts Official Check-In first, weekly ahead of monthly', () => {
    expect(officialCoinPickerRank(WEEKLY)).toBeLessThan(officialCoinPickerRank(MONTHLY));
    expect(officialCoinPickerRank(MONTHLY)).toBeLessThan(officialCoinPickerRank({ id: '30-day' }));
  });

  it('collects both room ids weekly first', () => {
    expect(officialCoinRoomIds([MONTHLY, { id: 'other' }, WEEKLY])).toEqual([
      'weekly-id',
      'monthly-id',
    ]);
  });
});
