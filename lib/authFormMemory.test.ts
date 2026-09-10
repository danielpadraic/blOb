import { describe, expect, it } from 'vitest';

import {
  peekPendingAuthEmail,
  setPendingAuthEmail,
  takePendingAuthEmail,
} from '@/lib/authFormMemory';

describe('authFormMemory', () => {
  it('stores, peeks, and consumes an email without a query string', () => {
    setPendingAuthEmail('  ada@blob.app  ');
    expect(peekPendingAuthEmail()).toBe('ada@blob.app');
    expect(takePendingAuthEmail()).toBe('ada@blob.app');
    expect(takePendingAuthEmail()).toBe('');
    expect(peekPendingAuthEmail()).toBe('');
  });

  it('clears on empty', () => {
    setPendingAuthEmail('ada@blob.app');
    setPendingAuthEmail('   ');
    expect(peekPendingAuthEmail()).toBe('');
  });
});
