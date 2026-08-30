import { describe, expect, it } from 'vitest';

import { checkinSubmitHref } from '@/lib/routes';
import { localUriFromPickerAsset } from '@/utils/media';
import { isActiveWaveTagStatus } from '@/lib/waveTags';

describe('checkinSubmitHref', () => {
  it('opens submit for that challenge and never Wave or capture', () => {
    expect(checkinSubmitHref('abc-1')).toBe('/challenges/abc-1/submit');
    expect(String(checkinSubmitHref('abc-1'))).not.toContain('capture');
    expect(String(checkinSubmitHref('abc-1'))).not.toContain('wave');
  });

  it('keeps a gallery file when Safari omits uri', () => {
    expect(localUriFromPickerAsset({ uri: 'file://shot.jpg' })).toBe('file://shot.jpg');
    expect(localUriFromPickerAsset({ uri: '', file: null })).toBeNull();
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
