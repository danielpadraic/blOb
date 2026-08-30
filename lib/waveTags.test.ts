import { describe, expect, it } from 'vitest';

import { checkinSubmitHref } from '@/lib/routes';
import { isActiveWaveTagStatus } from '@/lib/waveTags';

describe('checkinSubmitHref', () => {
  it('opens submit for that challenge and never Wave or capture', () => {
    expect(checkinSubmitHref('abc-1')).toEqual({
      pathname: '/challenges/[id]/submit',
      params: { id: 'abc-1' },
    });
  });
});

describe('isActiveWaveTagStatus', () => {
  it('keeps open / live / upcoming and drops ended leftovers', () => {
    expect(isActiveWaveTagStatus('live')).toBe(true);
    expect(isActiveWaveTagStatus('open')).toBe(true);
    expect(isActiveWaveTagStatus('upcoming')).toBe(true);
    expect(isActiveWaveTagStatus('ended')).toBe(false);
    expect(isActiveWaveTagStatus('settled')).toBe(false);
    expect(isActiveWaveTagStatus('cancelled')).toBe(false);
  });
});
