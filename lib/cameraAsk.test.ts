import { describe, expect, it } from 'vitest';

import { cameraAskLine, resolveCameraAsk } from '@/lib/cameraAsk';

describe('camera ask', () => {
  it('keeps the prompt off Bob and only retries after a real stream failure', () => {
    expect(resolveCameraAsk({ queried: 'prompt' })).toBe('prompt');
    expect(resolveCameraAsk({})).toBe('prompt');
    expect(resolveCameraAsk({ queried: 'denied' })).toBe('denied');
    expect(resolveCameraAsk({ queried: 'granted' })).toBe('ready');
    expect(resolveCameraAsk({ queried: 'granted', errorKind: 'other' })).toBe('error');
    expect(resolveCameraAsk({ errorKind: 'denied' })).toBe('denied');
    expect(cameraAskLine('prompt', true)).toBe('Allow camera to check in.');
    expect(cameraAskLine('denied', true)).toBe('Turn on camera in Settings.');
    expect(cameraAskLine('error', false)).toBe('Camera didn’t start.');
    expect(cameraAskLine('ready', true)).toBeNull();
  });
});
