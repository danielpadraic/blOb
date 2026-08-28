import { describe, expect, it } from 'vitest';

import { COMPOSER_MAX_HEIGHT, COMPOSER_MIN_HEIGHT, composerFieldHeight } from '@/lib/composerField';

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
});
