import { describe, expect, it } from 'vitest';

import {
  addCounterMetric,
  blankLiveFrom,
  clampCounterValue,
  COUNTER_TEMPLATES,
  counterStep,
  defaultCounterTitle,
  formatCounterNumber,
  formatCounterSummary,
  makeMetric,
  metricsFromTemplate,
  parseCounterInput,
  stepCounterValue,
} from '@/lib/counter/session';
import { COUNTER_METRIC_MAX, type CounterDraft } from '@/lib/counter/types';

function draft(metrics: CounterDraft['metrics']): CounterDraft {
  return {
    id: 'c1',
    title: 'Sales day',
    status: 'live',
    parentId: null,
    cardUrl: null,
    metrics,
    createdAt: '2026-09-23T12:00:00.000Z',
    updatedAt: '2026-09-23T12:00:00.000Z',
    savedAt: null,
  };
}

describe('counter session', () => {
  it('defaults a skipped title to the date', () => {
    expect(defaultCounterTitle(new Date('2026-09-23T18:00:00.000Z'))).toMatch(/Sep 23/);
  });

  it('clamps count to a whole number and money to two places', () => {
    expect(clampCounterValue('count', 10.9)).toBe(10);
    expect(clampCounterValue('money', 16000.456)).toBe(16000.46);
    expect(clampCounterValue('count', -3)).toBe(0);
    expect(parseCounterInput('money', '16000')).toBe(16000);
    expect(formatCounterNumber('money', 16000)).toBe('$16,000.00');
  });

  it('steps by 1 unless a decimal value is already there', () => {
    expect(counterStep('count', 10)).toBe(1);
    expect(counterStep('money', 16)).toBe(1);
    expect(counterStep('decimal', 3)).toBe(1);
    expect(counterStep('decimal', 3.25)).toBe(0.01);
    expect(stepCounterValue('count', 9, 1)).toBe(10);
    expect(stepCounterValue('count', 0, -1)).toBe(0);
  });

  it('fills Sales day without Pinnacle copy', () => {
    const sales = COUNTER_TEMPLATES.find((row) => row.id === 'sales');
    expect(sales?.label).toBe('Sales day');
    expect(sales?.label.toLowerCase()).not.toContain('pinnacle');
    const metrics = metricsFromTemplate(sales!);
    expect(metrics.map((row) => row.kind)).toEqual(['count', 'count', 'money']);
  });

  it('caps metrics at 12 and start-again zeros values', () => {
    let next = draft([makeMetric({ name: 'Dials', kind: 'count', value: 10 })]);
    for (let i = 0; i < 20; i += 1) {
      next = addCounterMetric(next, { name: `M${i}`, kind: 'count' });
    }
    expect(next.metrics).toHaveLength(COUNTER_METRIC_MAX);
    const fresh = blankLiveFrom({
      ...next,
      metrics: [
        makeMetric({ name: 'Dials', kind: 'count', value: 10 }),
        makeMetric({ name: 'AP', kind: 'money', value: 16000 }),
      ],
    });
    expect(fresh.metrics.map((row) => row.value)).toEqual([0, 0]);
    expect(fresh.metrics.map((row) => row.name)).toEqual(['Dials', 'AP']);
    expect(formatCounterSummary(fresh.metrics)).toContain('Dials 0');
  });
});
