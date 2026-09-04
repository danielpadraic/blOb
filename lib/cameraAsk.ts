export type CameraAsk = 'prompt' | 'denied' | 'error' | 'ready';

/** Prompt / undetermined is not a crash. Retry only after a real stream failure. */
export function resolveCameraAsk(input: {
  queried?: 'granted' | 'denied' | 'prompt';
  errorKind?: 'denied' | 'missing' | 'other' | null;
}): CameraAsk {
  if (input.errorKind === 'denied') {
    return 'denied';
  }
  if (input.errorKind === 'missing' || input.errorKind === 'other') {
    return 'error';
  }
  if (input.queried === 'denied') {
    return 'denied';
  }
  if (input.queried === 'granted') {
    return 'ready';
  }
  return 'prompt';
}

/** Check-in stills: Expo can report the nested `/submit` screen as unfocused on iOS. Path is enough. */
export function checkinCameraFocused(input: {
  navFocused: boolean;
  pathname?: string | null;
}): boolean {
  if (input.navFocused) {
    return true;
  }
  return String(input.pathname ?? '').includes('/submit');
}

export function cameraAskLine(ask: CameraAsk, checkin: boolean): string | null {
  if (ask === 'prompt') {
    return checkin ? 'Allow camera to check in.' : 'Allow camera.';
  }
  if (ask === 'denied') {
    return 'Turn on camera in Settings.';
  }
  if (ask === 'error') {
    return 'Camera didn’t start.';
  }
  return null;
}
