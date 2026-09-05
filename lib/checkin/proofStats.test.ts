import { describe, expect, it } from 'vitest';

import {
  hasProofStats,
  proofStatChips,
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
      'Daniel logged 41 minutes and 412 calories. Their average heart rate was 108 bpm.',
    );
  });

  it('includes miles for a run and uses an Oxford list', () => {
    expect(proofStatsProse({ stats: RUN, displayName: 'Silas' })).toBe(
      'Silas logged 30 minutes, 5.00 mi, and 305 calories. Their average heart rate was 152 bpm.',
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
      'They logged 41 minutes and 412 calories. Their average heart rate was 108 bpm.',
    );
  });

  it('uses a supplied pronoun when one is known', () => {
    expect(
      proofStatsProse({
        stats: STRENGTH,
        displayName: 'Courtney',
        pronoun: { subject: 'she', possessive: 'her' },
      }),
    ).toBe('Courtney logged 41 minutes and 412 calories. Her average heart rate was 108 bpm.');
  });

  it('says minute in the singular', () => {
    expect(
      proofStatsProse({ stats: { activity: 'strength', duration_sec: 45, active_cal: 12 }, displayName: 'Bob' }),
    ).toBe('Bob logged 1 minute and 12 calories.');
  });
});
