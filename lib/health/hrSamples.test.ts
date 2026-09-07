import { describe, expect, it } from 'vitest';

import { overlapsWindow, samplesWithin, type HeartRateRecord } from '@/lib/health/hrSamples';

const FROM = Date.parse('2026-09-06T10:00:00.000Z');
const TO = Date.parse('2026-09-06T10:10:00.000Z');

function at(minute: number, second = 0): string {
  return new Date(FROM + minute * 60_000 + second * 1000).toISOString();
}

function record(over?: Partial<HeartRateRecord>): HeartRateRecord {
  return {
    startTime: at(0),
    endTime: at(10),
    samples: [],
    ...over,
  };
}

describe('overlapsWindow', () => {
  it('accepts a record that straddles the window', () => {
    expect(overlapsWindow(at(-5), at(5), FROM, TO)).toBe(true);
  });

  it('rejects a record that finishes before the window opens', () => {
    expect(overlapsWindow(at(-20), at(-10), FROM, TO)).toBe(false);
  });

  it('rejects a record with no readable span rather than scanning it', () => {
    expect(overlapsWindow(undefined, at(5), FROM, TO)).toBe(false);
    expect(overlapsWindow('not a date', at(5), FROM, TO)).toBe(false);
  });
});

describe('samplesWithin', () => {
  it('puts a trace in time order however the records arrived', () => {
    const late = record({
      startTime: at(5),
      endTime: at(10),
      samples: [{ time: at(6), beatsPerMinute: 150 }],
    });
    const early = record({
      startTime: at(0),
      endTime: at(5),
      samples: [
        { time: at(3), beatsPerMinute: 120 },
        { time: at(1), beatsPerMinute: 95 },
      ],
    });
    expect(samplesWithin([late, early], FROM, TO).map((s) => s.bpm)).toEqual([95, 120, 150]);
  });

  it('drops readings that fall outside the workout', () => {
    const rows = [
      record({
        samples: [
          { time: at(-1), beatsPerMinute: 70 },
          { time: at(2), beatsPerMinute: 130 },
          { time: at(30), beatsPerMinute: 180 },
        ],
      }),
    ];
    expect(samplesWithin(rows, FROM, TO).map((s) => s.bpm)).toEqual([130]);
  });

  it('reads beatsPerMinute or the generic value field', () => {
    const rows = [
      record({
        samples: [
          { time: at(1), value: 101 },
          { time: at(2), beatsPerMinute: 102 },
        ],
      }),
    ];
    expect(samplesWithin(rows, FROM, TO).map((s) => s.bpm)).toEqual([101, 102]);
  });

  it('keeps an untimed reading at the start rather than losing it', () => {
    const rows = [
      record({ samples: [{ beatsPerMinute: 88 }, { time: at(4), beatsPerMinute: 140 }] }),
    ];
    const out = samplesWithin(rows, FROM, TO);
    expect(out.map((s) => s.bpm)).toEqual([88, 140]);
    expect(out[0].at).toBe(new Date(FROM).toISOString());
  });

  it('refuses nonsense readings without discarding the rest', () => {
    const rows = [
      record({
        samples: [
          { time: at(1), beatsPerMinute: 0 },
          { time: at(2), beatsPerMinute: Number.NaN },
          { time: at(3), beatsPerMinute: -5 },
          { time: at(4), beatsPerMinute: 128 },
        ],
      }),
    ];
    expect(samplesWithin(rows, FROM, TO).map((s) => s.bpm)).toEqual([128]);
  });

  it('never scans a record whose own span misses the window', () => {
    const rows = [
      record({
        startTime: at(-40),
        endTime: at(-30),
        // A stray in-window timestamp on an out-of-window record must not sneak in.
        samples: [{ time: at(2), beatsPerMinute: 200 }],
      }),
    ];
    expect(samplesWithin(rows, FROM, TO)).toEqual([]);
  });

  it('returns nothing for an empty or inverted window', () => {
    const rows = [record({ samples: [{ time: at(1), beatsPerMinute: 120 }] })];
    expect(samplesWithin(rows, TO, FROM)).toEqual([]);
    expect(samplesWithin(rows, Number.NaN, TO)).toEqual([]);
  });

  it('rounds to whole beats, since that is what the card prints', () => {
    const rows = [record({ samples: [{ time: at(1), beatsPerMinute: 118.6 }] })];
    expect(samplesWithin(rows, FROM, TO)[0].bpm).toBe(119);
  });
});
