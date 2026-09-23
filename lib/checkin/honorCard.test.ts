import { describe, expect, it } from 'vitest';

import {
  HONOR_CARD_SLIDE,
  HONOR_CARD_SOURCE,
  buildHonorProofCard,
  hasHonorRecapUrl,
  honorCardFieldsFromLog,
  honorPeriodLabel,
  honorSlideForPost,
  honorStatChipLabel,
  isHonorCardStats,
  pagerUrlsWithHonorCard,
  unionHonorCardMedia,
} from '@/lib/checkin/honorCard';
import { proofStatChips } from '@/lib/checkin/proofStats';
import { emptyActivity, type ComparablePointsConfig } from '@/lib/comparablePoints';

function pinnacleConfig(): ComparablePointsConfig {
  return {
    version: 1,
    parity_points: 16000,
    window: 'challenge',
    extras_keep_adding: true,
    lanes: [
      { id: 'rookie', name: 'Rookie', label: 'Rookie' },
      { id: 'veteran', name: 'Veteran', label: 'Veteran' },
    ],
    activities: [
      emptyActivity({
        id: 'act-dials',
        name: 'Dials',
        unit: 'dials',
        parity_qty: 2800,
        input_kind: 'count',
        icon_key: 'calls',
        multiplier: {
          enabled: true,
          extra_factor: 1,
          label: 'Presentations',
          tiers: [{ threshold: 8, percent: 100 }],
        },
      }),
      emptyActivity({
        id: 'act-ap',
        name: 'AP',
        unit: 'USD',
        parity_qty: 16000,
        input_kind: 'money',
        icon_key: 'money',
        multiplier: { enabled: false, extra_factor: 1 },
      }),
    ],
    text_fields: [{ id: 'txt-details', label: 'Details', required: false }],
  };
}

describe('honor recap card', () => {
  it('reads scoring_config fields and does not invent a caption', () => {
    const fields = honorCardFieldsFromLog(pinnacleConfig(), {
      'act-dials': 120,
      'multiplier:presentations': 2,
      'act-ap': 400,
    });
    expect(fields.map((field) => field.label)).toEqual(['Dials', 'Presentations', 'AP']);
    expect(fields.some((field) => field.label === 'Details')).toBe(false);
    const card = buildHonorProofCard({
      config: pinnacleConfig(),
      metrics: { 'act-dials': 120, 'multiplier:presentations': 2, 'act-ap': 400 },
      laneId: 'rookie',
      title: 'Rookies vs. Veterans',
      periodKey: '2026-09-23',
      timeZone: 'America/Chicago',
    });
    expect(card?.laneLabel).toBe('Rookie');
    expect(card?.periodLabel).toMatch(/Sep 23/);
    expect(card?.fields.map((field) => honorStatChipLabel(field))).toEqual([
      '120 Dials',
      '2 Pres',
      '$400 AP',
    ]);
  });

  it('shows zeros when the field was on the form', () => {
    const fields = honorCardFieldsFromLog(pinnacleConfig(), { 'act-dials': 0, 'act-ap': 0 });
    expect(fields.find((field) => field.key === 'act-dials')?.value).toBe(0);
    expect(honorStatChipLabel(fields.find((field) => field.key === 'multiplier:presentations')!)).toBe('0 Pres');
  });

  it('hides a chip when that field was not on the form', () => {
    const gym: ComparablePointsConfig = {
      version: 1,
      parity_points: 10,
      activities: [
        emptyActivity({
          id: 'act-ap',
          name: 'AP',
          unit: 'USD',
          parity_qty: 16000,
          input_kind: 'money',
          multiplier: { enabled: false, extra_factor: 1 },
        }),
      ],
    };
    const fields = honorCardFieldsFromLog(gym, { 'act-ap': 400, 'act-dials': 99 });
    expect(fields.map((field) => field.key)).toEqual(['act-ap']);
  });

  it('injects a drawable recap slide without replacing a user still', () => {
    const stats = {
      source: HONOR_CARD_SOURCE,
      honor_fields: [
        { key: 'act-dials', label: 'Dials', chip_label: 'Dials', value: 120, kind: 'count' },
      ],
    };
    expect(isHonorCardStats(stats)).toBe(true);
    expect(pagerUrlsWithHonorCard(['https://cdn.test/selfie.jpg'], stats)).toEqual([
      'https://cdn.test/selfie.jpg',
      HONOR_CARD_SLIDE,
    ]);
    expect(honorSlideForPost({ stats })?.url).toBe(HONOR_CARD_SLIDE);
  });

  it('replaces only the previous honor recap URL', () => {
    expect(
      unionHonorCardMedia({
        existing: ['https://cdn.test/selfie.jpg', 'https://cdn.test/u/honor_card-1.jpg'],
        nextCardUrl: 'https://cdn.test/u/honor_card-2.jpg',
        previousCardUrl: 'https://cdn.test/u/honor_card-1.jpg',
      }),
    ).toEqual(['https://cdn.test/selfie.jpg', 'https://cdn.test/u/honor_card-2.jpg']);
  });

  it('recognizes a stored recap by path prefix or named card_url, not the drawable token', () => {
    expect(hasHonorRecapUrl(['https://cdn.test/u/honor_card-9.jpg'], null)).toBe(true);
    expect(
      hasHonorRecapUrl(['https://cdn.test/selfie.jpg'], {
        source: HONOR_CARD_SOURCE,
        card_url: 'https://cdn.test/u/honor_card-9.jpg',
      }),
    ).toBe(true);
    expect(
      hasHonorRecapUrl([], {
        source: HONOR_CARD_SOURCE,
        honor_fields: [{ key: 'act-dials', label: 'Dials', value: 10, kind: 'count' }],
      }),
    ).toBe(false);
    expect(hasHonorRecapUrl([HONOR_CARD_SLIDE], { source: HONOR_CARD_SOURCE })).toBe(false);
    expect(hasHonorRecapUrl(['https://cdn.test/u/workout_card-1.jpg'], null)).toBe(false);
  });
});

describe('honor chips on Live / Home', () => {
  it('prints form fields including zeros, never a generated sentence', () => {
    const chips = proofStatChips({
      source: HONOR_CARD_SOURCE,
      honor_fields: [
        { key: 'act-dials', label: 'Dials', chip_label: 'Dials', value: 120, kind: 'count' },
        { key: 'multiplier:presentations', label: 'Presentations', chip_label: 'Pres', value: 2, kind: 'count' },
        { key: 'act-ap', label: 'AP', chip_label: 'AP', value: 400, kind: 'money' },
      ],
    });
    expect(chips.map((chip) => chip.label)).toEqual(['120 Dials', '2 Pres', '$400 AP']);
    for (const chip of chips) {
      expect(chip.label).not.toMatch(/logged|pts at full value/i);
    }
  });

  it('does not steal the Health recap path', () => {
    expect(
      proofStatChips({
        activity: 'strength',
        duration_sec: 600,
        hr_avg: 108,
      }).map((chip) => chip.label),
    ).toEqual(['Workout Time 10:00', '108 bpm avg']);
  });
});
