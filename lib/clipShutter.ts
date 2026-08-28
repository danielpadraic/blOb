/** Wave / Round video shutter: tap starts, tap stops. Hold may start; release does not stop. */

export type ClipShutterKind = 'wave' | 'round';

export function clipShutterIdleLabel(kind: ClipShutterKind): string {
  return kind === 'wave' ? 'Tap to wave · 30s' : 'Tap to record · 3:00';
}

export function clipShutterLabel(kind: ClipShutterKind, recording: boolean): string {
  return recording ? 'Tap to stop' : clipShutterIdleLabel(kind);
}

export function clipShutterReleaseStopsRecording(): boolean {
  return false;
}
