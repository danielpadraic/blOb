import { describe, expect, it } from 'vitest';

import {
  canHouseActOnChallenge,
  houseBuyInLabel,
  officialOpsAddError,
  officialOpsRemoveError,
} from '@/lib/officialOps';

describe('official House copy', () => {
  it('maps add errors to the locked lines', () => {
    expect(officialOpsAddError('That challenge already settled.')).toBe('That challenge already settled.');
    expect(officialOpsAddError('They’re already in.')).toBe('They’re already in.');
    expect(officialOpsAddError('INSUFFICIENT_FUNDS')).toBe('Couldn’t add them.');
    expect(officialOpsAddError('')).toBe('Couldn’t add them.');
  });

  it('maps remove settled to the same settled line', () => {
    expect(officialOpsRemoveError('That challenge already settled.')).toBe(
      'That challenge already settled.',
    );
    expect(officialOpsRemoveError('boom')).toBe('Couldn’t remove them.');
  });

  it('prints the three buy-in choices in plain words', () => {
    expect(houseBuyInLabel('charge')).toBe('They pay the entry fee');
    expect(houseBuyInLabel('house')).toBe('House covers');
    expect(houseBuyInLabel('none')).toBe('Seat only');
  });

  it('disables House after settled', () => {
    expect(canHouseActOnChallenge({ status: 'live' })).toBe(true);
    expect(canHouseActOnChallenge({ status: 'settled' })).toBe(false);
    expect(canHouseActOnChallenge({ status: 'ended' })).toBe(false);
  });
});
