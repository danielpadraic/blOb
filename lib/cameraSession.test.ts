import { describe, expect, it } from 'vitest';

import { isLiveCameraPath, stopMedia } from '@/lib/cameraSession';

function track() {
  return {
    enabled: true,
    stopped: false,
    stop() {
      this.stopped = true;
    },
  };
}

describe('stopMedia', () => {
  it('stops tracks, disables them, clears the video, and stops the recorder', () => {
    const a = track();
    const b = track();
    const video = {
      srcObject: { id: 'live' } as unknown,
      src: 'https://cdn.example/clip.mp4',
      paused: false,
      loaded: false,
      pause() {
        this.paused = true;
      },
      removeAttribute(name: string) {
        if (name === 'src') {
          this.src = '';
        }
      },
      load() {
        this.loaded = true;
      },
    };
    const recorder = { state: 'recording', stopped: false, stop() { this.stopped = true; this.state = 'inactive'; } };

    stopMedia({
      stream: { getTracks: () => [a, b] },
      video,
      recorder,
    });

    expect(a.enabled).toBe(false);
    expect(b.enabled).toBe(false);
    expect(a.stopped).toBe(true);
    expect(b.stopped).toBe(true);
    expect(video.srcObject).toBeNull();
    expect(video.src).toBe('');
    expect(video.loaded).toBe(true);
    expect(video.paused).toBe(true);
    expect(recorder.stopped).toBe(true);
  });
});

describe('isLiveCameraPath', () => {
  it('keeps Wave / Round / check-in camera live and treats Home as dead', () => {
    expect(isLiveCameraPath('/capture')).toBe(true);
    expect(isLiveCameraPath('/challenges/abc/submit')).toBe(true);
    expect(isLiveCameraPath('/feed')).toBe(false);
    expect(isLiveCameraPath('/challenges/abc')).toBe(false);
    expect(isLiveCameraPath('/login')).toBe(false);
  });
});
