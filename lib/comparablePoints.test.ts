import { describe, expect, it } from 'vitest';

import {
  comparableCheckinCaption,
  comparableLogFields,
  activityScoresForLane,
  comparablePointsLaneSubline,
  comparablePointsLiveSentence,
  emptyActivity,
  emptyComparablePointsConfig,
  extrasKeepAddingFor,
  formatComparableBoardCell,
  formatMoneyAmount,
  formatMoneySentenceAmount,
  inferInputKind,
  inferScoreWindow,
  multiplierMetricKey,
  parseComparablePointsConfig,
  parseMoneyInput,
  resolveMultiplierPercent,
  scoreComparableWindow,
  scoreSampleActivity,
  validateComparablePointsConfig,
  type ComparablePointsConfig,
} from '@/lib/comparablePoints';

function gymConfig(partial?: Partial<ComparablePointsConfig>): ComparablePointsConfig {
  return {
    version: 1,
    parity_points: 10_000,
    window: 'challenge',
    extras_keep_adding: true,
    activities: [
      emptyActivity({
        id: 'walks',
        name: 'Floor walks',
        unit: 'walks',
        parity_qty: 4800,
        input_kind: 'count',
        multiplier: {
          enabled: true,
          extra_factor: 1,
          label: 'Demos',
          tiers: [
            { threshold: 5, percent: 50 },
            { threshold: 10, percent: 100 },
          ],
        },
      }),
      emptyActivity({
        id: 'tickets',
        name: 'Closed tickets',
        unit: 'USD',
        parity_qty: 30_000,
        input_kind: 'money',
        multiplier: { enabled: false, extra_factor: 1 },
      }),
    ],
    text_fields: [{ id: 'closed', label: 'What closed', required: false }],
    choice_fields: [{ id: 'shift', label: 'Shift', options: ['Morning', 'Night'] }],
    ...partial,
  };
}

describe('comparable points config', () => {
  it('infers money from USD and defaults window / extras', () => {
    const parsed = parseComparablePointsConfig({
      version: 1,
      parity_points: 100,
      activities: [
        {
          id: 'a',
          name: 'Closed tickets',
          unit: 'USD',
          parity_qty: 30000,
          multiplier: { enabled: false, extra_factor: 1 },
          qualifiers: { enabled: false, items: [] },
        },
      ],
    });
    expect(parsed?.activities[0]?.input_kind).toBe('money');
    expect(inferInputKind('USD')).toBe('money');
    expect(inferInputKind('$')).toBe('money');
    expect(inferScoreWindow(undefined)).toBe('challenge');
    expect(parsed?.extras_keep_adding).toBe(true);
    expect(parsed?.window).toBe('challenge');
  });

  it('rejects unnamed activities and duplicate choice options', () => {
    expect(validateComparablePointsConfig(emptyComparablePointsConfig()).ok).toBe(false);
    const invalid = gymConfig({
      choice_fields: [{ id: 'shift', label: 'Shift', options: ['Morning', 'morning'] }],
    });
    const result = validateComparablePointsConfig(invalid);
    expect(result.ok).toBe(false);
  });

  it('writes a live sentence from host names, never canned product words', () => {
    const sentence = comparablePointsLiveSentence(gymConfig());
    expect(sentence).toBe(
      '4800 walks of Floor walks with 10 Demos equals 10,000 points, and $30,000 of Closed tickets equals 10,000 points.',
    );
    expect(sentence.toLowerCase()).not.toMatch(/dial|annual premium|\bap\b|fex|iul|pinnacle|rookie|veteran/);
    expect(sentence).not.toContain('USD');
    expect(sentence).not.toContain(' pts');
  });

  it('drops a colliding unit and prints money plus the full-value multiplier', () => {
    const config: ComparablePointsConfig = {
      version: 1,
      parity_points: 13_000,
      activities: [
        emptyActivity({
          id: 'act-count',
          name: 'Dials',
          unit: 'dials',
          parity_qty: 3500,
          input_kind: 'count',
          lane_ids: ['rookie'],
          multiplier: {
            enabled: true,
            extra_factor: 1,
            label: 'Presentations',
            tiers: [
              { threshold: 5, percent: 50 },
              { threshold: 10, percent: 100 },
            ],
          },
        }),
        emptyActivity({
          id: 'act-money',
          name: 'AP',
          unit: 'USD',
          parity_qty: 13_000,
          input_kind: 'money',
          lane_ids: ['rookie', 'veteran'],
          multiplier: { enabled: false, extra_factor: 1 },
        }),
      ],
      lanes: [
        { id: 'rookie', label: 'Rookie' },
        { id: 'veteran', label: 'Veteran' },
      ],
    };
    expect(comparablePointsLiveSentence(config)).toBe(
      '3500 Dials with 10 Presentations equals 13,000 points, and $13,000 of AP equals 13,000 points.',
    );
    expect(comparablePointsLaneSubline(config)).toBe(
      'Rookies score Dials (with Presentations) and AP. Veterans score AP only.',
    );
    expect(formatMoneySentenceAmount(13_000)).toBe('$13,000');
    expect(
      formatComparableBoardCell({ key: 'act-ap', label: 'AP', money: true }, { 'act-ap': 6500 }),
    ).toBe('$6,500');
    expect(
      formatComparableBoardCell({ key: 'act-dials', label: 'Dials', money: false }, { 'act-dials': 3500 }),
    ).toBe('3500');
  });
});

describe('money parse', () => {
  it('reads accounting-style money as a number', () => {
    expect(parseMoneyInput('$2,000')).toBe(2000);
    expect(parseMoneyInput('0')).toBe(0);
    expect(parseMoneyInput('')).toBe(0);
    expect(parseMoneyInput('$0.50')).toBe(0.5);
    expect(formatMoneyAmount(2000)).toBe('$2,000.00');
  });
});

describe('extras above parity', () => {
  it('keeps adding when extras stay on', () => {
    const activity = emptyActivity({
      id: 'walks',
      name: 'Floor walks',
      unit: 'walks',
      parity_qty: 4800,
      multiplier: { enabled: false, extra_factor: 1 },
    });
    expect(extrasKeepAddingFor(activity, { extras_keep_adding: true })).toBe(true);
    expect(scoreSampleActivity({ parity_points: 10_000 }, activity, 9600)).toBe(20_000);
  });

  it('caps at full value when extras are off', () => {
    const activity = emptyActivity({
      id: 'walks',
      name: 'Floor walks',
      unit: 'walks',
      parity_qty: 4800,
      multiplier: { enabled: false, extra_factor: 0 },
    });
    expect(scoreSampleActivity({ parity_points: 10_000, extras_keep_adding: false }, activity, 9600)).toBe(
      10_000,
    );
  });
});

describe('window totals then score', () => {
  it('revalues the whole window with the window multiplier, not a sum of daily scores', () => {
    const config = gymConfig();
    const demoKey = multiplierMetricKey('Demos');
    const dayOne = scoreSampleActivity(config, config.activities[0]!, 800, true, 6);
    const dayTwo = scoreSampleActivity(config, config.activities[0]!, 4000, true, 4);
    expect(dayOne + dayTwo).not.toBe(
      scoreComparableWindow(config, { walks: 4800, [demoKey]: 10, tickets: 0 }),
    );
    expect(scoreComparableWindow(config, { walks: 800, [demoKey]: 6, tickets: 0 })).toBe(
      Math.round((800 / 4800) * 10_000 * 0.5),
    );
    expect(scoreComparableWindow(config, { walks: 4800, [demoKey]: 10, tickets: 2000 })).toBe(
      10_000 + Math.round((2000 / 30_000) * 10_000),
    );
  });

  it('stays at the last tier when the source is past the last threshold', () => {
    const walks = gymConfig().activities[0]!;
    expect(resolveMultiplierPercent(walks, 12)).toBe(100);
    expect(resolveMultiplierPercent(walks, 10)).toBe(100);
    expect(resolveMultiplierPercent(walks, 6)).toBe(50);
    expect(resolveMultiplierPercent(walks, 4)).toBe(0);
  });

  it('scores a zero window as zero so an empty honor send is allowed', () => {
    expect(scoreComparableWindow(gymConfig(), { walks: 0, tickets: 0 })).toBe(0);
  });

  it('gates a lane-listed activity and leaves open activities for every lane', () => {
    const config = parseComparablePointsConfig({
      version: 1,
      parity_points: 13_000,
      lanes: [
        { id: 'rookie', label: 'Rookie' },
        { id: 'veteran', label: 'Veteran' },
      ],
      activities: [
        {
          id: 'act-dials',
          name: 'Dials',
          unit: 'dials',
          parity_qty: 3500,
          lane_ids: ['rookie'],
          multiplier: { enabled: false, extra_factor: 1 },
          qualifiers: { enabled: false, items: [] },
        },
        {
          id: 'act-ap',
          name: 'AP',
          unit: 'USD',
          parity_qty: 13_000,
          lane_ids: ['rookie', 'veteran'],
          multiplier: { enabled: false, extra_factor: 1 },
          qualifiers: { enabled: false, items: [] },
        },
      ],
    })!;
    const totals = { 'act-dials': 3500, 'act-ap': 13_000 };
    expect(activityScoresForLane(config.activities[0]!, 'rookie')).toBe(true);
    expect(activityScoresForLane(config.activities[0]!, 'veteran')).toBe(false);
    expect(activityScoresForLane(config.activities[0]!, null)).toBe(false);
    expect(scoreComparableWindow(config, totals, 'rookie')).toBe(26_000);
    expect(scoreComparableWindow(config, totals, 'veteran')).toBe(13_000);
    expect(scoreComparableWindow(config, totals, null)).toBe(0);
    expect(scoreComparableWindow(config, totals, 'veteran')).not.toBe(0);
  });
});

describe('generated log fields', () => {
  it('builds numeric, multiplier, text, and choice fields from host labels', () => {
    const fields = comparableLogFields(gymConfig());
    expect(fields.map((field) => field.label)).toEqual([
      'Floor walks',
      'Demos',
      'Closed tickets',
      'What closed',
      'Shift',
    ]);
    expect(fields.find((field) => field.kind === 'activity' && field.label === 'Closed tickets')?.inputKind).toBe(
      'money',
    );
    expect(comparableCheckinCaption(gymConfig(), {})).toBe('Check-in Complete');
    expect(comparableCheckinCaption(gymConfig(), { closed: 'Two tickets' })).toBe('Two tickets');
  });

  it('hides a self-serve Side choice when scoring lanes exist', () => {
    const fields = comparableLogFields(
      gymConfig({
        lanes: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
        choice_fields: [{ id: 'side', label: 'Side', options: ['A', 'B'] }],
      }),
    );
    expect(fields.some((field) => field.kind === 'choice')).toBe(false);
    expect(fields.map((field) => field.label)).not.toContain('Side');
  });
});
