import { describe, expect, it } from 'vitest';

import { copy, interpolateCopy } from '@/lib/copy';

describe('interpolateCopy', () => {
  it('does not call replace when the template is missing', () => {
    expect(interpolateCopy(undefined as unknown as string, { name: 'Courtney' })).toBe('');
  });

  it('fills {name}', () => {
    expect(interpolateCopy('Hi {name}', { name: 'Courtney' })).toBe('Hi Courtney');
  });
});

describe('copy', () => {
  it('returns empty string for a missing key instead of throwing', () => {
    expect(copy('not.a.real.key' as never)).toBe('');
  });
});
