import { describe, expect, it } from 'vitest';

import { checkinSubmitHref, errorRetryHref } from '@/lib/routes';
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
    const original = URL.createObjectURL;
    URL.createObjectURL = () => 'blob:gallery-file';
    expect(localUriFromPickerAsset({ uri: '', file: new Blob(['x'], { type: 'image/jpeg' }) })).toBe(
      'blob:gallery-file',
    );
    URL.createObjectURL = original;
  });

  it('retries Check In submit and never reloads Wave capture', () => {
    expect(errorRetryHref('/capture')).toBe('/feed');
    expect(errorRetryHref('/capture?mode=story')).toBe('/feed');
    expect(errorRetryHref('/challenges/abc-1/submit')).toBe('/challenges/abc-1/submit');
    expect(errorRetryHref('/feed')).toBe('/feed');
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
