import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  classifySaveCapture,
  copyCaptureForLibrary,
  resetSaveCaptureForTests,
  SAVE_CAPTURE_DENIED,
  SAVE_CAPTURE_DENIED_ANDROID,
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
    expect(SAVE_CAPTURE_DENIED).toBe(
      'Couldn’t save to Photos. Enable Photos for blOb in iOS Settings.',
    );
    expect(SAVE_CAPTURE_DENIED_ANDROID).toBe(
      'Couldn’t save to Photos. Enable Photos for blOb in Settings.',
    );
    expect(SAVE_CAPTURE_WEB).toBe('Save to Photos');
  });

  it('writes Photos through the legacy media-library saver', () => {
    const source = readFileSync(join(process.cwd(), 'lib/saveCapture.ts'), 'utf8');
    expect(source).toContain("import('expo-media-library/legacy')");
    expect(source).toContain('saveToLibraryAsync');
    expect(source).not.toMatch(/import\('expo-media-library'\)/);
  });

  it('exposes copyCaptureForLibrary for the copy-then-Photos path', () => {
    expect(typeof copyCaptureForLibrary).toBe('function');
  });
});
