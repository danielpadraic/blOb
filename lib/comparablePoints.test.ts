import { describe, expect, it } from 'vitest';

import {
  comparableCheckinCaption,
  comparableLogFields,
  comparablePointsLiveSentence,
  emptyActivity,
  emptyComparablePointsConfig,
  extrasKeepAddingFor,
  formatMoneyAmount,
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
    expect(sentence).toContain('Floor walks');
    expect(sentence).toContain('Closed tickets');
    expect(sentence).toContain('4800 walks');
    expect(sentence.toLowerCase()).not.toMatch(/dial|annual premium|\bap\b|fex|iul|pinnacle|rookie|veteran/);
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
});
