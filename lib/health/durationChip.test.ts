import { describe, expect, it } from 'vitest';

import { formatHealthDuration } from '@/lib/health/durationChip';

describe('formatHealthDuration', () => {
  it('keeps seconds under an hour', () => {
    expect(formatHealthDuration(2100)).toBe('35:00');
    expect(formatHealthDuration(2470)).toBe('41:10');
    expect(formatHealthDuration(600)).toBe('10:00');
  });

  it('uses h:mm:ss at or above 60 minutes', () => {
    expect(formatHealthDuration(3912)).toBe('1:05:12');
    expect(formatHealthDuration(3600)).toBe('1:00:00');
  });

  it('hides missing or zero', () => {
    expect(formatHealthDuration(null)).toBeNull();
    expect(formatHealthDuration(0)).toBeNull();
    expect(formatHealthDuration(undefined)).toBeNull();
  });
});
