import { describe, expect, it } from 'vitest';

import {
  CASH_OFFICIAL_BANNER,
  CASH_OFFICIAL_JOINS_LIVE,
  CASH_OFFICIAL_PAYOUTS_PENDING,
  cashOfficialBannerHelper,
  cashOfficialGate,
  cashOfficialJoinBlockedCopy,
  cashOfficialJoinsAllowed,
} from '@/lib/officialCash';

describe('CASH_OFFICIAL_JOINS_LIVE', () => {
  it('is off until the Finix contest MID is live', () => {
    expect(CASH_OFFICIAL_JOINS_LIVE).toBe(false);
  });
});

describe('CASH_OFFICIAL_BANNER', () => {
  it('sells the ladder, not 3-Day vs you', () => {
    expect(CASH_OFFICIAL_BANNER.title).toBe('Weekly $1 · Monthly $10');
    expect(CASH_OFFICIAL_BANNER.helper).toBe('Real money Officials. Skill, not chance.');
    expect(CASH_OFFICIAL_BANNER.cta).toBe('View');
    const all = Object.values(CASH_OFFICIAL_BANNER).join(' ');
    expect(all).not.toContain('3-Day');
    expect(all).not.toContain('Day 1 of 3');
  });
});

describe('cashOfficialGate', () => {
  it('holds every join while payouts are off', () => {
    const gate = cashOfficialGate({ dobStatus: 'ok', declaredRegion: 'TX' });
    expect(gate).toBe('payouts_pending');
    expect(cashOfficialJoinsAllowed(gate)).toBe(false);
    expect(cashOfficialJoinBlockedCopy(gate)).toBe(CASH_OFFICIAL_PAYOUTS_PENDING);
  });

  it('puts the age wall ahead of the payouts hold', () => {
    const gate = cashOfficialGate({ dobStatus: 'underage', declaredRegion: 'TX' });
    expect(gate).toBe('underage');
    expect(cashOfficialJoinBlockedCopy(gate)).toBe('Official Challenges are for 18 and up.');
  });

  it('blocks a blocked cash state, including Nevada', () => {
    for (const region of ['NV', 'AZ', 'TN', 'PR']) {
      const gate = cashOfficialGate({ dobStatus: 'ok', declaredRegion: region, joinsLive: true });
      expect(gate).toBe('geo_blocked');
      expect(cashOfficialJoinBlockedCopy(gate)).toBe(
        'Sorry, this Challenge isn’t available in your State.',
      );
    }
  });

  it('leaves limited and allow states to the per-challenge server check', () => {
    for (const region of ['WA', 'NY', 'TX']) {
      expect(
        cashOfficialGate({ dobStatus: 'ok', declaredRegion: region, joinsLive: true }),
      ).toBe('open');
    }
  });

  it('opens only when payouts are live, the viewer is 18+, and the state allows cash', () => {
    expect(
      cashOfficialGate({ dobStatus: 'ok', declaredRegion: 'TX', joinsLive: true }),
    ).toBe('open');
    expect(
      cashOfficialJoinsAllowed(
        cashOfficialGate({ dobStatus: 'ok', declaredRegion: 'TX', joinsLive: true }),
      ),
    ).toBe(true);
  });

  it('asks for a birth date once payouts are live', () => {
    expect(
      cashOfficialGate({ dobStatus: 'dob_required', declaredRegion: 'TX', joinsLive: true }),
    ).toBe('dob_required');
  });

  it('never opens a join with no state on file while payouts are off', () => {
    expect(cashOfficialJoinsAllowed(cashOfficialGate({ dobStatus: 'ok' }))).toBe(false);
  });
});

describe('cashOfficialBannerHelper', () => {
  it('keeps the sales line by default — the hero only offers View', () => {
    expect(cashOfficialBannerHelper('payouts_pending')).toBe(CASH_OFFICIAL_BANNER.helper);
    expect(cashOfficialBannerHelper('open')).toBe(CASH_OFFICIAL_BANNER.helper);
  });

  it('never advertises a price to someone who can never pay it', () => {
    expect(cashOfficialBannerHelper('underage')).toBe('Official Challenges are for 18 and up.');
    expect(cashOfficialBannerHelper('geo_blocked')).toBe(
      'Sorry, this Challenge isn’t available in your State.',
    );
  });
});
