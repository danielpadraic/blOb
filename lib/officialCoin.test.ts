import { describe, expect, it } from 'vitest';

import { normalizeChallenge } from '@/lib/challenges';
import { displayChallengePot } from '@/lib/challengePot';
import { challengeDisplayTitle } from '@/lib/challengeTitle';
import {
  canRejoinOfficialCoin,
  formatOfficialCoinAmount,
  isOfficialCoinChallenge,
  officialCoinDisplayTitle,
  OFFICIAL_COIN_LEAVE_CONFIRM,
  OFFICIAL_COIN_REJOIN_PILL,
  OFFICIAL_COIN_TITLE,
  officialCoinAllowedDays,
  officialCoinBoardHeaderLine,
  officialCoinDaysLeft,
  officialCoinGuarantee,
  officialCoinKind,
  officialCoinEndClock,
  officialCoinEndDateLabel,
  officialCoinMidWindowLine,
  officialCoinPickerRank,
  officialCoinRoomIds,
  officialCoinScoreLabel,
  OFFICIAL_COIN_ABOUT,
  OFFICIAL_COIN_HERO_LINE,
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

describe('Overview copy', () => {
  it('uses the locked Official blOb Challenge block', () => {
    expect(OFFICIAL_COIN_ABOUT.title).toBe('Official blOb Challenge:');
    expect(OFFICIAL_COIN_ABOUT.body).toBe(
      'Earn coins by Checking In consistently each day. ' +
        'The more consistent you are, the higher the prize.',
    );
    expect(OFFICIAL_COIN_ABOUT.proofTitle).toBe('Check-In Proof:');
    expect([...OFFICIAL_COIN_ABOUT.proofs]).toEqual([
      'a Pre-Workout Selfie',
      'a Post-Workout Selfie',
      'Proof of 30-Minutes of Elevated Heart Rate',
    ]);
  });

  it('puts one 30-minute line in the hero', () => {
    expect(OFFICIAL_COIN_HERO_LINE).toBe(
      'Complete 30-Minutes of exercise each day of the challenge.',
    );
  });

  it('drops the old house-room paragraph and never says CST', () => {
    const shown = [
      OFFICIAL_COIN_HERO_LINE,
      OFFICIAL_COIN_ABOUT.title,
      OFFICIAL_COIN_ABOUT.body,
      OFFICIAL_COIN_ABOUT.proofTitle,
      ...OFFICIAL_COIN_ABOUT.proofs,
    ].join(' ');
    expect(shown).not.toContain('The house room');
    expect(shown).not.toContain('Log a workout each Chicago day');
    expect(shown).not.toContain('CST');
  });
});

describe('officialCoinEndClock', () => {
  it('prints the last Chicago day, not the exclusive end instant', () => {
    // Monthly ends_at is Oct 1 00:00 Chicago, so the readable end is Sep 30.
    expect(officialCoinEndDateLabel(MONTHLY)).toBe('Sep. 30, 2026');
    // Weekly ends_at is Mon Sep 28 00:00 Chicago, so the readable end is Sun Sep 27.
    expect(officialCoinEndDateLabel(WEEKLY)).toBe('Sep. 27, 2026');
  });

  it('shows the date with no clock while more than a day is left', () => {
    expect(officialCoinEndClock(MONTHLY, FRIDAY)).toEqual({
      line: 'Ends Sep. 30, 2026',
      urgent: false,
    });
    const weekly = officialCoinEndClock(WEEKLY, FRIDAY);
    expect(weekly?.line).toBe('Ends Sep. 27, 2026');
    expect(weekly?.line).not.toContain('PM');
    expect(weekly?.line).not.toContain(':');
  });

  it('switches to a ticking countdown inside the last 24 hours', () => {
    // 02:30:15 before the weekly window closes.
    const closeAt = new Date('2026-09-28T05:00:00.000Z').getTime();
    const clock = officialCoinEndClock(WEEKLY, new Date(closeAt - (2 * 3600 + 30 * 60 + 15) * 1000));
    expect(clock).toEqual({ line: 'Ends in 02:30:15', urgent: true });
  });

  it('pads every field to two digits and counts down by the second', () => {
    const closeAt = new Date('2026-09-28T05:00:00.000Z').getTime();
    const at = (msLeft: number) => officialCoinEndClock(WEEKLY, new Date(closeAt - msLeft))?.line;
    expect(at(150_000)).toBe('Ends in 00:02:30');
    expect(at(149_000)).toBe('Ends in 00:02:29');
    expect(at(9_000)).toBe('Ends in 00:00:09');
    expect(at(1_000)).toBe('Ends in 00:00:01');
    // Just inside the 24h boundary still counts, not a date.
    expect(at(24 * 60 * 60 * 1000 - 1000)).toBe('Ends in 23:59:59');
  });

  it('reads Ended once the window closes', () => {
    const closeAt = new Date('2026-09-28T05:00:00.000Z').getTime();
    expect(officialCoinEndClock(WEEKLY, new Date(closeAt))).toEqual({
      line: 'Ended Sep. 27, 2026',
      urgent: false,
    });
  });

  it('is null for anything that is not a house room', () => {
    expect(officialCoinEndClock({ id: 'x', ends_at: WEEKLY.ends_at }, FRIDAY)).toBeNull();
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

describe('public titles', () => {
  it('names the two rooms by product, not by official_kind', () => {
    expect(OFFICIAL_COIN_TITLE.coin_weekly).toBe('Weekly Fitness Challenge');
    expect(OFFICIAL_COIN_TITLE.coin_monthly).toBe('Monthly Fitness Challenge');
    expect(officialCoinDisplayTitle(WEEKLY)).toBe('Weekly Fitness Challenge');
    expect(officialCoinDisplayTitle(MONTHLY)).toBe('Monthly Fitness Challenge');
  });

  it('rewrites a stale stored title even when official_kind was not selected', () => {
    expect(officialCoinDisplayTitle({ title: 'Official Weekly Coin' })).toBe(
      'Weekly Fitness Challenge',
    );
    expect(officialCoinDisplayTitle({ title: '  official monthly coin ' })).toBe(
      'Monthly Fitness Challenge',
    );
  });

  it('leaves every other challenge alone', () => {
    expect(officialCoinDisplayTitle({ title: '30-Day Consistency' })).toBe('');
    expect(officialCoinDisplayTitle({ title: 'Weekly $10 Guarantee' })).toBe('');
    expect(officialCoinDisplayTitle(null)).toBe('');
  });

  it('never leaves the internal words on a user-visible string', () => {
    const shown = [
      OFFICIAL_COIN_TITLE.coin_weekly,
      OFFICIAL_COIN_TITLE.coin_monthly,
      OFFICIAL_COIN_REJOIN_PILL.title,
      OFFICIAL_COIN_REJOIN_PILL.subline,
      OFFICIAL_COIN_LEAVE_CONFIRM.title,
      OFFICIAL_COIN_LEAVE_CONFIRM.body,
      OFFICIAL_COIN_HERO_LINE,
      OFFICIAL_COIN_ABOUT.body,
      officialCoinBoardHeaderLine(WEEKLY, FRIDAY),
      officialCoinBoardHeaderLine(MONTHLY, FRIDAY),
    ].join(' | ');
    expect(shown).not.toContain('Official Weekly Coin');
    expect(shown).not.toContain('Official Monthly Coin');
  });
});

describe('challengeDisplayTitle', () => {
  it('prints the public name for the house rooms', () => {
    expect(challengeDisplayTitle({ ...WEEKLY, title: 'Official Weekly Coin' })).toBe(
      'Weekly Fitness Challenge',
    );
    expect(challengeDisplayTitle({ ...MONTHLY, title: 'Official Monthly Coin' })).toBe(
      'Monthly Fitness Challenge',
    );
  });

  it('leaves other challenge names untouched', () => {
    expect(challengeDisplayTitle({ title: 'Weekly $10 Guarantee' })).toBe('Weekly $10 Guarantee');
    expect(challengeDisplayTitle({ title: '30-Day Consistency' })).toBe('30-Day Consistency');
  });
});

describe('displayChallengePot', () => {
  it('reads the house guarantee, never the empty prize_pool', () => {
    expect(displayChallengePot({ ...WEEKLY, prize_pool: 0, status: 'live' })).toBe(100);
    expect(displayChallengePot({ ...MONTHLY, prize_pool: 0, status: 'live' })).toBe(1000);
  });

  it('formats the monthly guarantee with a comma', () => {
    expect(formatOfficialCoinAmount(displayChallengePot({ ...MONTHLY, prize_pool: 0 }))).toBe(
      '1,000',
    );
    expect(formatOfficialCoinAmount(displayChallengePot({ ...WEEKLY, prize_pool: 0 }))).toBe('100');
  });

  it('still reads prize_pool for every other room', () => {
    expect(displayChallengePot({ prize_pool: 250, status: 'live' })).toBe(250);
    expect(displayChallengePot({ prize_pool: 0, host_budget: 10, status: 'settled' })).toBe(10);
  });
});

describe('canRejoinOfficialCoin', () => {
  const both = { roomsExist: true, weeklyJoined: true, monthlyJoined: true };

  it('stays hidden while they are on both rooms', () => {
    expect(canRejoinOfficialCoin(both)).toBe(false);
  });

  it('shows after Leave Official', () => {
    expect(canRejoinOfficialCoin({ roomsExist: true, optedOut: true })).toBe(true);
  });

  it('shows when only one room stuck', () => {
    expect(
      canRejoinOfficialCoin({ roomsExist: true, weeklyJoined: true, monthlyJoined: false }),
    ).toBe(true);
    expect(
      canRejoinOfficialCoin({ roomsExist: true, weeklyJoined: false, monthlyJoined: true }),
    ).toBe(true);
  });

  it('hides itself the moment both memberships are back, even if opted_out lingers', () => {
    expect(canRejoinOfficialCoin({ ...both, optedOut: false })).toBe(false);
  });

  it('never renders before the rooms load, so the rail cannot show a dead chip', () => {
    expect(canRejoinOfficialCoin({ roomsExist: false, optedOut: true })).toBe(false);
    expect(canRejoinOfficialCoin({})).toBe(false);
  });
});

describe('OFFICIAL_COIN_REJOIN_PILL', () => {
  it('uses the locked slot-0 copy', () => {
    expect(OFFICIAL_COIN_REJOIN_PILL.title).toBe('Rejoin Official');
    expect(OFFICIAL_COIN_REJOIN_PILL.subline).toBe('Weekly + Monthly · remaining days');
    expect(OFFICIAL_COIN_REJOIN_PILL.error).toBe('Couldn’t rejoin. Try again.');
  });

  it('leaves the Leave confirm exactly as shipped', () => {
    expect(OFFICIAL_COIN_LEAVE_CONFIRM.body).toBe(
      'You’ll leave the Weekly and Monthly Official rooms. Home Live from those rooms goes away.',
    );
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
