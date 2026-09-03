import { describe, expect, it } from 'vitest';

import { challengeHref, checkinSubmitHref, clipRouteId, errorRetryHref, publishedRowId, waveHref } from '@/lib/routes';
import { localUriFromPickerAsset } from '@/utils/media';
import { isActiveWaveTagStatus } from '@/lib/waveTags';

describe('checkinSubmitHref', () => {
  it('opens submit for that challenge and never Wave or capture', () => {
    expect(challengeHref('abc-1')).toBe('/challenges/abc-1');
    expect(checkinSubmitHref('abc-1')).toBe('/challenges/abc-1/submit');
    expect(String(checkinSubmitHref('abc-1'))).not.toContain('capture');
    expect(String(checkinSubmitHref('abc-1'))).not.toContain('wave');
    expect(String(checkinSubmitHref('abc-1'))).not.toContain('returnTo');
    expect(String(checkinSubmitHref('abc-1'))).not.toContain('tab=feed');
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
    expect(errorRetryHref('/challenges/abc-1')).toBe('/challenges/abc-1?tab=feed');
    expect(errorRetryHref('/challenges/abc-1?postId=p1')).toBe('/challenges/abc-1?tab=feed');
    expect(errorRetryHref('/feed')).toBe('/feed');
    expect(errorRetryHref('/feed/compose')).toBe('/feed');
    expect(errorRetryHref('/compose')).toBe('/feed');
    expect(errorRetryHref('/wave/undefined')).toBe('/feed');
    expect(errorRetryHref('/round/')).toBe('/feed');
    expect(errorRetryHref('/wave/2ca49850-b978-45d8-a282-2b644913c538')).toBe(
      '/wave/2ca49850-b978-45d8-a282-2b644913c538',
    );
  });
});

describe('clip route id', () => {
  it('reads a uuid from the insert row, not the wrapper', () => {
    const id = '2ca49850-b978-45d8-a282-2b644913c538';
    expect(clipRouteId(id)).toBe(id);
    expect(clipRouteId('undefined')).toBeNull();
    expect(clipRouteId(undefined)).toBeNull();
    expect(publishedRowId({ data: [{ id }] })).toBe(id);
    expect(publishedRowId({ id })).toBe(id);
    expect(publishedRowId([{ id }])).toBe(id);
    expect(String(waveHref('undefined'))).toBe('/feed');
    expect(String(waveHref(id))).toBe(`/wave/${id}`);
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
