import { describe, expect, it } from 'vitest';

import {
  COMPOSER_MAX_HEIGHT,
  COMPOSER_MIN_HEIGHT,
  composerFieldHeight,
  descriptionGrowMaxLines,
  wrappedLineCount,
} from '@/lib/composerField';

describe('composerFieldHeight', () => {
  it('stays at the single-line bar when empty or collapsed', () => {
    expect(composerFieldHeight({ text: '' })).toBe(COMPOSER_MIN_HEIGHT);
    expect(composerFieldHeight({ collapsed: true, text: 'a\nb\nc' })).toBe(COMPOSER_MIN_HEIGHT);
  });

  it('grows through six lines then caps so the field can scroll', () => {
    const six = '1\n2\n3\n4\n5\n6';
    expect(composerFieldHeight({ text: six })).toBe(COMPOSER_MAX_HEIGHT);
    expect(composerFieldHeight({ text: `${six}\n7` })).toBe(COMPOSER_MAX_HEIGHT);
    expect(composerFieldHeight({ text: '1\n2\n3\n4' })).toBeGreaterThan(COMPOSER_MIN_HEIGHT);
  });

  it('sizes a long wrapped paragraph on first paint so it is not one clipped row', () => {
    const paragraph = 'Run 128 miles by January 1. Log every session. Friends keep you honest the whole way.';
    expect(wrappedLineCount(paragraph)).toBeGreaterThan(1);
    expect(composerFieldHeight({ text: paragraph, minHeight: 52, lineHeight: 22, maxLines: 12 })).toBeGreaterThan(
      52,
    );
    expect(descriptionGrowMaxLines(800)).toBeGreaterThanOrEqual(6);
  });
});
