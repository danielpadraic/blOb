import { describe, expect, it } from 'vitest';

import { COMPOSER_MAX_HEIGHT, COMPOSER_MIN_HEIGHT, composerFieldHeight } from '@/lib/composerField';

describe('composerFieldHeight', () => {
  it('stays at the single-line bar when empty or collapsed', () => {
    expect(composerFieldHeight({ text: '' })).toBe(COMPOSER_MIN_HEIGHT);
    expect(composerFieldHeight({ collapsed: true, text: 'a\nb\nc' })).toBe(COMPOSER_MIN_HEIGHT);
  });

  it('grows through eight lines then caps so the field can scroll', () => {
    const eight = '1\n2\n3\n4\n5\n6\n7\n8';
    expect(composerFieldHeight({ text: eight })).toBe(COMPOSER_MAX_HEIGHT);
    expect(composerFieldHeight({ text: `${eight}\n9` })).toBe(COMPOSER_MAX_HEIGHT);
  });
});
