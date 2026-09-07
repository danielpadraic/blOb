import { describe, expect, it } from 'vitest';

import { hrSignatureFor } from '@/lib/health/hrSignature';

const START = Date.UTC(2026, 8, 5, 20, 0);

/** One reading, `min` minutes into the workout. */
function reading(bpm: number, min: number) {
  return { at: new Date(START + min * 60000).toISOString(), bpm };
}

/** A steady session: `count` readings a minute apart, all at the same rate. */
function steady(bpm: number, count: number) {
  return Array.from({ length: count }, (_, index) => reading(bpm, index));
}

describe('reading a heart-rate signature', () => {
  it('describes a steady session by its own rate', () => {
    const signature = hrSignatureFor({ samples: steady(120, 30), durationSec: 30 * 60 });
    expect(signature).toMatchObject({ points: 30, mean: 120, peak: 120, floor: 120, sd: 0 });
  });

  it('reports the climb as work starts and the fall as it stops', () => {
    // Up 10 bpm a minute for 3, flat, then down 20 a minute for the last 2.
    const samples = [
      reading(80, 0),
      reading(90, 1),
      reading(100, 2),
      reading(110, 3),
      reading(150, 4),
      reading(150, 5),
      reading(150, 6),
      reading(150, 7),
      reading(150, 8),
      reading(130, 9),
      reading(110, 10),
    ];
    const signature = hrSignatureFor({ samples, durationSec: 10 * 60 });
    expect(signature?.onsetBpmPerMin).toBe(10);
    expect(signature?.recoveryBpmPerMin).toBe(-20);
  });

  it('takes the peak off the 95th percentile, so one sensor spike is not the peak', () => {
    const samples = [...steady(120, 40), reading(255, 41)];
    // 255 is inside the plausible range, so it is kept as a reading — it just does not become the peak.
    expect(hrSignatureFor({ samples, durationSec: 41 * 60 })?.peak).toBe(120);
  });

  it('is null for a workout too short to say anything about', () => {
    expect(hrSignatureFor({ samples: steady(130, 20), durationSec: 120 })).toBeNull();
  });

  it('is null when the watch recorded no heart rate', () => {
    expect(hrSignatureFor({ samples: [], durationSec: 45 * 60 })).toBeNull();
    expect(hrSignatureFor({ samples: steady(120, 3), durationSec: 45 * 60 })).toBeNull();
  });

  it('falls back to a stored series, without inventing slopes it cannot see', () => {
    // A backfilled session: the trace survived, its sample times did not.
    const signature = hrSignatureFor({
      series: [96, 100, 104, 108, 112, 116, 120, 124, 128, 132],
      durationSec: 120 * 60,
    });
    expect(signature?.points).toBe(10);
    expect(signature?.mean).toBe(114);
    // Ten points across two hours puts nothing inside a 2-minute window at either end.
    expect(signature?.recoveryBpmPerMin).toBeNull();
    expect(signature?.onsetBpmPerMin).toBeNull();
  });

  it('prefers live samples over a stored series when it has both', () => {
    const signature = hrSignatureFor({
      samples: steady(150, 30),
      series: [90, 90, 90, 90, 90, 90, 90, 90, 90, 90],
      durationSec: 30 * 60,
    });
    expect(signature?.mean).toBe(150);
  });
});

describe('telling two people apart on the same workout', () => {
  // The Sep 5 walk, taken together: same activity, 143 and 144 minutes, one watch each.
  const daniel = hrSignatureFor({
    samples: [...steady(103, 60), ...Array.from({ length: 20 }, (_, i) => reading(100 + (i % 9), 60 + i))],
    durationSec: 143 * 60,
  });
  const courtney = hrSignatureFor({
    samples: [...steady(120, 60), ...Array.from({ length: 20 }, (_, i) => reading(117 + (i % 9), 60 + i))],
    durationSec: 144 * 60,
  });

  it('puts a clear gap between two bodies doing the same work', () => {
    expect(daniel && courtney).toBeTruthy();
    expect(courtney!.mean - daniel!.mean).toBeGreaterThan(10);
  });

  it('still reads each one as a steady walk rather than intervals', () => {
    expect(daniel!.sd).toBeLessThan(10);
    expect(courtney!.sd).toBeLessThan(10);
  });
});
