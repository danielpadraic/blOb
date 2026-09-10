import { describe, expect, it } from 'vitest';

import { challengeHref, checkinSubmitHref, clipRouteId, errorBoundaryRetryHref, errorRetryHref, leaveCheckinHref, profileRetryHref, publishedRowId, waveHref } from '@/lib/routes';
import { localUriFromPickerAsset } from '@/utils/media';
import { isActiveWaveTagStatus } from '@/lib/waveTags';

describe('checkinSubmitHref', () => {
  it('opens submit for that challenge and never Wave or capture', () => {
    expect(challengeHref('abc-1')).toBe('/challenges/abc-1');
    expect(String(challengeHref('abc-1'))).not.toBe('/challenges');
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

  it('retries Check In submit onto that Live list and never reloads Wave capture', () => {
    expect(errorRetryHref('/capture')).toBe('/feed');
    expect(errorRetryHref('/capture?mode=story')).toBe('/feed');
    expect(errorRetryHref('/challenges/abc-1/submit')).toBe('/challenges/abc-1/submit');
    expect(errorRetryHref('/challenges/abc-1')).toBe('/challenges/abc-1?tab=feed');
    expect(errorRetryHref('/challenges/abc-1?postId=p1')).toBe('/challenges/abc-1?tab=feed');
    expect(errorRetryHref('/challenges/abc-1?tab=overview')).toBe('/challenges/abc-1?tab=overview');
    expect(errorRetryHref('/feed')).toBe('/feed');
    expect(errorRetryHref('/feed/compose')).toBe('/feed');
    expect(errorRetryHref('/compose')).toBe('/feed');
    expect(errorRetryHref('/wave/undefined')).toBe('/feed');
    expect(errorRetryHref('/round/')).toBe('/feed');
    expect(errorRetryHref('/wave/2ca49850-b978-45d8-a282-2b644913c538')).toBe(
      '/wave/2ca49850-b978-45d8-a282-2b644913c538',
    );
    expect(errorBoundaryRetryHref('/feed')).toBe('/feed');
    expect(errorBoundaryRetryHref('/feed/u/courtney')).toBe('/feed/u/courtney');
    expect(errorBoundaryRetryHref('/messages')).toBe('/messages');
    expect(profileRetryHref('/feed/u/courtney')).toBe('/feed/u/courtney');
    expect(profileRetryHref('/friends/u/courtney')).toBe('/friends/u/courtney');
    expect(profileRetryHref('/capture')).toBe('');
    expect(errorBoundaryRetryHref('/')).toBe('/');
    expect(errorBoundaryRetryHref('/capture')).toBe('/feed');
    expect(errorBoundaryRetryHref('/capture?mode=story')).toBe('/feed');
    expect(errorBoundaryRetryHref('/challenges/abc-1')).toBe('/challenges/abc-1?tab=feed');
    expect(errorRetryHref('/challenges/u/blob')).toBe('/challenges/u/blob');
    expect(errorBoundaryRetryHref('/challenges/u/blob')).toBe('/challenges/u/blob');
    expect(errorBoundaryRetryHref('/messages/2ca49850-b978-45d8-a282-2b644913c538')).toBe(
      '/messages/2ca49850-b978-45d8-a282-2b644913c538',
    );
  });

  it('closes Check In onto that challenge Live, not Home', () => {
    expect(leaveCheckinHref('abc-1')).toBe('/challenges/abc-1?tab=feed');
    expect(leaveCheckinHref('abc-1', { tab: 'overview' })).toBe('/challenges/abc-1?tab=overview');
    expect(leaveCheckinHref('abc-1', { from: 'multi' })).toBe('/challenges/abc-1?tab=feed');
    expect(leaveCheckinHref('abc-1', { from: 'feed' })).toBe('/challenges/abc-1?tab=feed');
    expect(leaveCheckinHref('')).toBe('/challenges');
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
