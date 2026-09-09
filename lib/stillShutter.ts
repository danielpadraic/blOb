/** Check-in still shutter: busy chrome on tap, not after the file lands. */

export const STILL_SHUTTER_HOLD_MS = 700;
export const STILL_SHUTTER_GOT_IT = 'Got it';
export const STILL_SHUTTER_HOLD = 'Hold still…';

export type StillShutterCopy = typeof STILL_SHUTTER_GOT_IT | typeof STILL_SHUTTER_HOLD;

export function stillShutterCopy(elapsedMs: number): StillShutterCopy {
  return elapsedMs >= STILL_SHUTTER_HOLD_MS ? STILL_SHUTTER_HOLD : STILL_SHUTTER_GOT_IT;
}

/** Second tap while a still is in flight must not queue another take. */
export function stillShutterIgnoresTap(capturing: boolean): boolean {
  return capturing;
}
