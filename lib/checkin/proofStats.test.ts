import { describe, expect, it } from 'vitest';

import {
  hasProofStats,
  proofStatChips,
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

describe('no generated caption', () => {
  it('exposes no prose builder at all', async () => {
    // A check-in body is the user's own text or "Check-in Complete". Home and Live once rendered
    // "{Name} burned N calories in M minutes." — this fails if any prose helper comes back.
    const mod = (await import('@/lib/checkin/proofStats')) as Record<string, unknown>;
    for (const name of Object.keys(mod)) {
      expect(name).not.toMatch(/prose|pronoun|they_them/i);
    }
  });

  it('still gives Home and Live the chips, which are numbers and not a sentence', () => {
    const labels = proofStatChips(RUN).map((chip) => chip.label);
    expect(labels).toEqual(['30 min', '305 cal', '152 bpm avg', '5.00 mi']);
    for (const label of labels) {
      expect(label).not.toMatch(/burned|average heart rate|traveled/i);
    }
  });
});
