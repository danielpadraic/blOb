import { describe, expect, it } from 'vitest';

import { commentSheetHeight, roundRailLabel, waveWatchName } from '@/lib/clipWatch';
import { isWatchSurfacePath } from '@/lib/routes';

describe('commentSheetHeight', () => {
  it('uses ~42% of a tall viewport', () => {
    expect(commentSheetHeight(700)).toBe(294);
  });

  it('keeps a usable floor so the sheet cannot become a title sliver', () => {
    expect(commentSheetHeight(300)).toBe(168);
  });

  it('never exceeds a short viewport', () => {
    expect(commentSheetHeight(140)).toBe(140);
  });
});

describe('roundRailLabel', () => {
  it('prefers a one-line handle', () => {
    expect(roundRailLabel({ username: 'danielharder', display_name: 'Daniel Harder' })).toBe(
      '@danielharder',
    );
  });

  it('falls back to first name when there is no handle', () => {
    expect(roundRailLabel({ username: null, display_name: 'Daniel Harder' })).toBe('Daniel');
  });
});

describe('waveWatchName', () => {
  it('never shows Your Wave on the player', () => {
    expect(
      waveWatchName({
        isOwn: true,
        groupName: 'Your Wave',
        displayName: 'Daniel',
        username: 'danielharder',
      }),
    ).toBe('Daniel');
  });

  it('uses the friend name for someone else', () => {
    expect(
      waveWatchName({
        isOwn: false,
        groupName: 'Sam',
        displayName: 'Samantha',
      }),
    ).toBe('Sam');
  });
});

describe('isWatchSurfacePath', () => {
  it('matches Wave and Round player routes', () => {
    expect(isWatchSurfacePath('/wave/abc')).toBe(true);
    expect(isWatchSurfacePath('/round/abc')).toBe(true);
    expect(isWatchSurfacePath('/feed')).toBe(false);
    expect(isWatchSurfacePath('/capture')).toBe(false);
  });
});
