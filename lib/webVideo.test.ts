import { describe, expect, it } from 'vitest';

import { WEB_VIDEO_CONTROLS_LIST, WEB_VIDEO_LOCK } from '@/lib/webVideo';

describe('web video lock', () => {
  it('keeps playsInline and never enables Safari native controls', () => {
    expect(WEB_VIDEO_LOCK.playsInline).toBe(true);
    expect(WEB_VIDEO_LOCK['webkit-playsinline']).toBe('true');
    expect(WEB_VIDEO_LOCK.controls).toBe(false);
    expect(WEB_VIDEO_LOCK.disablePictureInPicture).toBe(true);
    expect(WEB_VIDEO_LOCK.disableRemotePlayback).toBe(true);
    expect(WEB_VIDEO_LOCK.controlsList).toBe(WEB_VIDEO_CONTROLS_LIST);
    expect(WEB_VIDEO_LOCK['x-webkit-airplay']).toBe('deny');
  });
});
