import { describe, expect, it } from 'vitest';

import {
  insertLiveDayBreaks,
  liveDayDateLine,
  liveDayLine,
  livePeriodKeyAt,
  type LiveDayBreakChallenge,
} from '@/lib/liveDayBreak';
import type { LiveThreadRow } from '@/lib/liveThread';
import type { PostWithMeta } from '@/lib/types';

/** 30-Day Consistency: Denver midnight start, host saved 30 days. */
const THIRTY_DAY: LiveDayBreakChallenge = {
  challenge_type: 'consistency',
  status: 'live',
  starts_at: '2026-09-01T06:00:00.000Z',
  duration_days: 30,
};

function postRow(id: string, createdAt: string): LiveThreadRow {
  return {
    id,
    createdAt,
    kind: 'post',
    post: { id, created_at: createdAt } as PostWithMeta,
  };
}

function dayLines(rows: LiveThreadRow[]): string[][] {
  return rows
    .filter((row) => row.kind === 'day')
    .map((row) => (row.kind === 'day' ? [row.dateLine, row.dayLine ?? ''] : []));
}

describe('liveDayDateLine', () => {
  it('reads a period key as its own calendar day', () => {
    expect(liveDayDateLine('2026-09-04')).toBe('Friday, September 4, 2026');
    expect(liveDayDateLine('2026-09-01')).toBe('Tuesday, September 1, 2026');
  });

  it('is empty for a key that is not a date', () => {
    expect(liveDayDateLine('')).toBe('');
    expect(liveDayDateLine('nope')).toBe('');
  });
});

describe('livePeriodKeyAt', () => {
  it('buckets on the host clock, not the device clock', () => {
    // 08:33 Denver on Sep 4 — the same instant is already Sep 4 in UTC too.
    expect(livePeriodKeyAt(THIRTY_DAY, '2026-09-04T14:33:00Z')).toBe('2026-09-04');
    // 19:00 Denver on Sep 4 is Sep 5 in UTC. Live must still call it Sep 4.
    expect(livePeriodKeyAt(THIRTY_DAY, '2026-09-05T01:00:00Z')).toBe('2026-09-04');
  });

  it('keeps a pre-start row on its own day instead of clamping to day 1', () => {
    expect(livePeriodKeyAt(THIRTY_DAY, '2026-08-30T18:00:00Z')).toBe('2026-08-30');
  });

  it('buckets an Official series on America/Chicago', () => {
    const official: LiveDayBreakChallenge = {
      is_official: true,
      series_id: 'week_10',
      status: 'live',
      starts_at: '2026-09-01T05:00:00.000Z',
      target_count: 7,
    };
    // 23:30 Chicago on Sep 4 is Sep 5 in UTC.
    expect(livePeriodKeyAt(official, '2026-09-05T04:30:00Z')).toBe('2026-09-04');
  });

  it('is empty for a missing or unparseable timestamp', () => {
    expect(livePeriodKeyAt(THIRTY_DAY, null)).toBe('');
    expect(livePeriodKeyAt(THIRTY_DAY, 'not-a-date')).toBe('');
  });
});

describe('liveDayLine', () => {
  it('counts the period index from starts_at against saved duration', () => {
    expect(liveDayLine(THIRTY_DAY, '2026-09-01')).toBe('Day 1 / 30');
    expect(liveDayLine(THIRTY_DAY, '2026-09-04')).toBe('Day 4 / 30');
    expect(liveDayLine(THIRTY_DAY, '2026-09-30')).toBe('Day 30 / 30');
  });

  it('never invents a denominator when the host saved no length', () => {
    expect(liveDayLine({ ...THIRTY_DAY, duration_days: null }, '2026-09-04')).toBeNull();
    // ends_at must not become the ring: no “Day 4 / 6”.
    expect(
      liveDayLine(
        { ...THIRTY_DAY, duration_days: null, ends_at: '2026-09-07T06:00:00.000Z' },
        '2026-09-04',
      ),
    ).toBeNull();
  });

  it('has no day line outside the run', () => {
    expect(liveDayLine(THIRTY_DAY, '2026-08-30')).toBeNull();
    expect(liveDayLine(THIRTY_DAY, '2026-10-05')).toBeNull();
  });

  it('needs a start to count from', () => {
    expect(liveDayLine({ ...THIRTY_DAY, starts_at: null }, '2026-09-04')).toBeNull();
  });
});

describe('insertLiveDayBreaks', () => {
  it('adds one break per period day, not one per bubble', () => {
    const rows = [
      postRow('a', '2026-09-03T16:00:00Z'),
      postRow('b', '2026-09-04T14:33:00Z'),
      postRow('c', '2026-09-04T15:10:00Z'),
      postRow('d', '2026-09-04T23:00:00Z'),
    ];
    const out = insertLiveDayBreaks(rows, THIRTY_DAY);
    expect(dayLines(out)).toEqual([
      ['Thursday, September 3, 2026', 'Day 3 / 30'],
      ['Friday, September 4, 2026', 'Day 4 / 30'],
    ]);
  });

  it('puts the break directly above the first row of that day', () => {
    const rows = [postRow('a', '2026-09-03T16:00:00Z'), postRow('b', '2026-09-04T14:33:00Z')];
    const out = insertLiveDayBreaks(rows, THIRTY_DAY);
    expect(out.map((row) => (row.kind === 'day' ? `day:${row.periodKey}` : row.id))).toEqual([
      'day:2026-09-03',
      'a',
      'day:2026-09-04',
      'b',
    ]);
  });

  it('keeps a same-day reply under the day it already opened', () => {
    const parent = { id: 'p', created_at: '2026-09-04T14:33:00Z' } as PostWithMeta;
    const rows: LiveThreadRow[] = [
      postRow('p', '2026-09-04T14:33:00Z'),
      {
        id: 'comment:c1',
        createdAt: '2026-09-04T18:00:00Z',
        kind: 'comment',
        comment: { id: 'c1', created_at: '2026-09-04T18:00:00Z' } as never,
        parent,
      },
    ];
    const out = insertLiveDayBreaks(rows, THIRTY_DAY);
    expect(out.filter((row) => row.kind === 'day')).toHaveLength(1);
    expect(out[0]?.kind).toBe('day');
  });

  it('shows the date alone for days with no known index', () => {
    const out = insertLiveDayBreaks([postRow('a', '2026-08-30T18:00:00Z')], THIRTY_DAY);
    expect(dayLines(out)).toEqual([['Sunday, August 30, 2026', '']]);
  });

  it('leaves rows untouched without a challenge', () => {
    const rows = [postRow('a', '2026-09-04T14:33:00Z')];
    expect(insertLiveDayBreaks(rows, null)).toBe(rows);
  });
});
