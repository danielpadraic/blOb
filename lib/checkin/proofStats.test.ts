import { describe, expect, it } from 'vitest';

import {
  hasProofStats,
  proofStatChips,
  THEY_THEM,
  pronounFromStats,
  proofStatsProse,
  type CheckinProofStats,
} from '@/lib/checkin/proofStats';

const STRENGTH: CheckinProofStats = {
  activity: 'strength',
  duration_sec: 2470,
  active_cal: 412,
  hr_min: 96,
  hr_avg: 108,
  hr_max: 141,
};

const RUN: CheckinProofStats = {
  activity: 'running',
  duration_sec: 1800,
  active_cal: 305,
  hr_avg: 152,
  distance_m: 8046.72,
};

describe('proof stat chips', () => {
  it('builds compact chips for a strength workout', () => {
    expect(proofStatChips(STRENGTH).map((chip) => chip.label)).toEqual([
      '41 min',
      '412 cal',
      '108 bpm avg',
    ]);
  });

  it('adds miles for running, walking and cycling', () => {
    expect(proofStatChips(RUN).map((chip) => chip.label)).toEqual([
      '30 min',
      '305 cal',
      '152 bpm avg',
      '5.00 mi',
    ]);
    expect(proofStatChips({ ...RUN, activity: 'walking' }).some((c) => c.key === 'distance')).toBe(true);
    expect(proofStatChips({ ...RUN, activity: 'cycling' }).some((c) => c.key === 'distance')).toBe(true);
  });

  it('does not show miles for a strength workout that happens to carry distance', () => {
    const chips = proofStatChips({ ...STRENGTH, distance_m: 500 });
    expect(chips.some((chip) => chip.key === 'distance')).toBe(false);
  });

  it('hides missing fields instead of printing zero', () => {
    expect(proofStatChips({ activity: 'strength', duration_sec: 2470 }).map((c) => c.label)).toEqual([
      '41 min',
    ]);
    expect(proofStatChips({ activity: 'strength', duration_sec: 0, active_cal: 0, hr_avg: 0 })).toEqual([]);
    expect(proofStatChips({ activity: 'running', distance_m: 0 })).toEqual([]);
  });

  it('falls back to total calories when active is missing', () => {
    const chips = proofStatChips({ activity: 'strength', duration_sec: 600, total_cal: 90 });
    expect(chips.map((chip) => chip.label)).toEqual(['10 min', '90 cal']);
  });

  it('renders nothing for a Prayer or honor check-in', () => {
    expect(proofStatChips(null)).toEqual([]);
    expect(proofStatChips(undefined)).toEqual([]);
    expect(proofStatChips({})).toEqual([]);
    expect(hasProofStats(null)).toBe(false);
    expect(hasProofStats(STRENGTH)).toBe(true);
  });

  it('rounds long distances to one decimal', () => {
    const chips = proofStatChips({ activity: 'running', distance_m: 32186.9 });
    expect(chips.map((chip) => chip.label)).toEqual(['20.0 mi']);
  });
});

describe('proof stats prose', () => {
  it('states only the numbers, with a they/them fallback', () => {
    expect(proofStatsProse({ stats: STRENGTH, displayName: 'Daniel' })).toBe(
      'Daniel burned 412 calories in 41 minutes. Average heart rate 108 bpm.',
    );
  });

  it('includes miles for a run and uses an Oxford list', () => {
    expect(proofStatsProse({ stats: RUN, displayName: 'Silas' })).toBe(
      'Silas burned 305 calories in 30 minutes. Average heart rate 152 bpm. Traveled 5.00 mi.',
    );
  });

  it('never invents an activity sentence', () => {
    const prose = proofStatsProse({ stats: STRENGTH, displayName: 'Daniel' }) ?? '';
    expect(prose).not.toMatch(/is strength training/i);
    expect(prose).not.toMatch(/was exercising/i);
    expect(prose).not.toMatch(/Daniel is /);
  });

  it('stays quiet when there is only one number to say', () => {
    expect(proofStatsProse({ stats: { activity: 'strength', duration_sec: 2470 }, displayName: 'Daniel' })).toBeNull();
    expect(proofStatsProse({ stats: { activity: 'strength', hr_avg: 108 }, displayName: 'Daniel' })).toBeNull();
    expect(proofStatsProse({ stats: null, displayName: 'Daniel' })).toBeNull();
    expect(proofStatsProse({ stats: {}, displayName: 'Daniel' })).toBeNull();
  });

  it('drops to the pronoun when there is no display name', () => {
    expect(proofStatsProse({ stats: STRENGTH })).toBe(
      'They burned 412 calories in 41 minutes. Average heart rate 108 bpm.',
    );
  });

  it('uses a supplied pronoun when one is known', () => {
    expect(
      proofStatsProse({
        stats: STRENGTH,
        displayName: 'Courtney',
        pronoun: { subject: 'she', possessive: 'her' },
      }),
    ).toBe('Courtney burned 412 calories in 41 minutes. Average heart rate 108 bpm.');
  });

  it('says minute in the singular', () => {
    expect(
      proofStatsProse({
        stats: { activity: 'strength', duration_sec: 45, active_cal: 12, hr_avg: 96 },
        displayName: 'Bob',
      }),
    ).toBe('Bob burned 12 calories in 1 minute. Average heart rate 96 bpm.');
  });
});

describe('pronoun stamped on the stats payload', () => {
  const NUMBERS = { activity: 'strength', duration_sec: 3002, active_cal: 275, hr_avg: 137 };

  it('opens with the pronoun the server derived from the author profile', () => {
    // The renderer cannot read profiles.gender, so the pronoun arrives on the stats payload.
    expect(proofStatsProse({ stats: { ...NUMBERS, pronoun: 'she' } })).toBe(
      'She burned 275 calories in 50 minutes. Average heart rate 137 bpm.',
    );
  });

  it('falls back to they/them when no pronoun was stamped', () => {
    expect(proofStatsProse({ stats: NUMBERS })).toBe(
      'They burned 275 calories in 50 minutes. Average heart rate 137 bpm.',
    );
  });

  it('prefers a real display name over the pronoun', () => {
    expect(proofStatsProse({ stats: { ...NUMBERS, pronoun: 'she' }, displayName: 'Courtney' })).toBe(
      'Courtney burned 275 calories in 50 minutes. Average heart rate 137 bpm.',
    );
  });

  it('maps a stamped subject pronoun onto its possessive', () => {
    expect(pronounFromStats({ pronoun: 'she' })).toEqual({ subject: 'she', possessive: 'her' });
    expect(pronounFromStats({ pronoun: 'he' })).toEqual({ subject: 'he', possessive: 'his' });
    expect(pronounFromStats({ pronoun: 'nonsense' })).toEqual(THEY_THEM);
    expect(pronounFromStats(null)).toEqual(THEY_THEM);
  });
});

describe('prose requires all three headline numbers', () => {
  it('stays quiet without average heart rate', () => {
    expect(
      proofStatsProse({ stats: { activity: 'strength', duration_sec: 2470, active_cal: 412 }, displayName: 'Daniel' }),
    ).toBeNull();
  });

  it('stays quiet without calories', () => {
    expect(
      proofStatsProse({ stats: { activity: 'strength', duration_sec: 2470, hr_avg: 108 }, displayName: 'Daniel' }),
    ).toBeNull();
  });

  it('stays quiet without duration', () => {
    expect(
      proofStatsProse({ stats: { activity: 'strength', active_cal: 412, hr_avg: 108 }, displayName: 'Daniel' }),
    ).toBeNull();
  });

  it('never prints a clock, even for a session that has a window', () => {
    const prose = proofStatsProse({ stats: RUN, displayName: 'Silas' }) ?? '';
    expect(prose).not.toMatch(/\d{1,2}:\d{2}/);
    // Word-bounded so it does not trip on the "pm" inside "bpm".
    expect(prose).not.toMatch(/\b(am|pm)\b/i);
  });
});
