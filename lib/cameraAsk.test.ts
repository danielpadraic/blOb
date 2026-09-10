import { describe, expect, it } from 'vitest';

import { cameraAskLine, CAMERA_PREVIEW_WATCHDOG_MS, checkinCameraFocused, resolveCameraAsk } from '@/lib/cameraAsk';

describe('camera ask', () => {
  it('keeps the prompt off Bob and only retries after a real stream failure', () => {
    expect(resolveCameraAsk({ queried: 'prompt' })).toBe('prompt');
    expect(resolveCameraAsk({})).toBe('prompt');
    expect(resolveCameraAsk({ queried: 'denied' })).toBe('denied');
    expect(resolveCameraAsk({ queried: 'granted' })).toBe('starting');
    expect(resolveCameraAsk({ queried: 'granted', errorKind: 'other' })).toBe('error');
    expect(resolveCameraAsk({ errorKind: 'denied' })).toBe('denied');
    expect(cameraAskLine('prompt', true)).toBe('Allow camera to check in.');
    expect(cameraAskLine('denied', true)).toBe('Turn on camera in Settings.');
    expect(cameraAskLine('error', true)).toBe('Couldn’t open camera');
    expect(CAMERA_PREVIEW_WATCHDOG_MS).toBe(2000);
    expect(cameraAskLine('starting', true)).toBeNull();
    expect(cameraAskLine('ready', true)).toBeNull();
  });

  it('treats /submit as focused for check-in camera even when the tab reports unfocused', () => {
    expect(checkinCameraFocused({ navFocused: false, pathname: '/challenges/abc/submit' })).toBe(true);
    expect(checkinCameraFocused({ navFocused: true, pathname: '/feed' })).toBe(true);
    expect(checkinCameraFocused({ navFocused: false, pathname: '/challenges/abc' })).toBe(false);
    expect(checkinCameraFocused({ navFocused: false, pathname: '/feed' })).toBe(false);
  });
});
