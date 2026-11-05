import { beforeEach, describe, expect, it } from 'vitest';

import {
  beginCardInflight,
  endCardInflight,
  isCardInflight,
  resetCardInflightForTests,
  takeCardHandoff,
  watchCardHandoff,
} from '@/lib/health/cardInflight';

describe('card in flight', () => {
  beforeEach(() => resetCardInflightForTests());

  it('marks a check-in while its card is being drawn or uploaded, then frees it', () => {
    expect(isCardInflight('k1')).toBe(false);
    beginCardInflight('k1');
    expect(isCardInflight('k1')).toBe(true);
    expect(isCardInflight('k2')).toBe(false);
    endCardInflight('k1');
    expect(isCardInflight('k1')).toBe(false);
  });

  it('lets go on its own so a crash cannot block a card forever', () => {
    const now = Date.now();
    beginCardInflight('k1', now);
    expect(isCardInflight('k1', now + 60_000)).toBe(true);
    expect(isCardInflight('k1', now + 120_000)).toBe(false);
  });

  it('reports a handed-off room once', () => {
    watchCardHandoff(['room-a', null, 'room-b']);
    expect(takeCardHandoff('room-a')).toBe(true);
    expect(takeCardHandoff('room-a')).toBe(false);
    expect(takeCardHandoff('room-c')).toBe(false);
    expect(takeCardHandoff('room-b')).toBe(true);
  });
});
