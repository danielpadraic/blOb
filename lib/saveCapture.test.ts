import { afterEach, describe, expect, it } from 'vitest';

import {
  classifySaveCapture,
  resetSaveCaptureForTests,
  SAVE_CAPTURE_DENIED,
  SAVE_CAPTURE_WEB,
} from '@/lib/saveCapture';

describe('save own capture', () => {
  afterEach(() => {
    resetSaveCaptureForTests();
  });

  it('skips gallery picks, Health, empty, and remote clips', () => {
    expect(classifySaveCapture({ uri: 'file://pre.jpg', fromLibrary: true })).toEqual({
      saved: false,
      uri: 'file://pre.jpg',
      reason: 'library',
    });
    expect(classifySaveCapture({ uri: 'health:hw-1', fromLibrary: false })).toEqual({
      saved: false,
      uri: 'health:hw-1',
      reason: 'health',
    });
    expect(classifySaveCapture({ uri: '', fromLibrary: false })).toEqual({
      saved: false,
      reason: 'empty',
    });
    expect(classifySaveCapture({ uri: 'https://blob.mobi/other.mp4' })).toEqual({
      saved: false,
      uri: 'https://blob.mobi/other.mp4',
      reason: 'remote',
    });
  });

  it('would write a local camera file once', () => {
    expect(classifySaveCapture({ uri: 'file:///var/tmp/wave.mp4' })).toBeNull();
  });

  it('keeps the denied caption short', () => {
    expect(SAVE_CAPTURE_DENIED).toBe('Couldn’t save to Photos.');
    expect(SAVE_CAPTURE_WEB).toBe('Save to Photos');
  });
});
