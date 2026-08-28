import { describe, expect, it } from 'vitest';

import {
  ROUND_RECORD_MAX_MS,
  ROUND_RECORD_MAX_SEC,
  WAVE_CLIP_MS,
  WAVE_RECORD_MAX_SEC,
  waveClipWindows,
} from '@/lib/waveClips';

describe('Wave and Round caps', () => {
  it('hard-stops a Wave at 30.00 seconds', () => {
    expect(WAVE_CLIP_MS).toBe(30_000);
    expect(WAVE_RECORD_MAX_SEC).toBe(30);
    expect(waveClipWindows(30_000, 'video')).toEqual([{ startMs: 0, durationMs: 30_000 }]);
  });

  it('caps a Round at 3:00', () => {
    expect(ROUND_RECORD_MAX_MS).toBe(180_000);
    expect(ROUND_RECORD_MAX_SEC).toBe(180);
  });
});
