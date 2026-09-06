/**
 * Clock arithmetic for timed rows.
 *
 * This lives apart from `session.ts` so the rounds model and the session model can both use it
 * without importing each other.
 */

const MAX_DURATION = 86400;

export function clampDuration(seconds: number | null | undefined): number {
  if (seconds == null || !Number.isFinite(seconds)) {
    return 0;
  }
  return Math.min(Math.max(Math.round(seconds), 0), MAX_DURATION);
}

/** Minutes and seconds are edited separately, so both directions of the conversion live here. */
export function splitDuration(seconds: number | null | undefined): {
  minutes: number;
  seconds: number;
} {
  const total = clampDuration(seconds);
  return { minutes: Math.floor(total / 60), seconds: total % 60 };
}

export function joinDuration(minutes: number, seconds: number): number {
  const safeMinutes = Number.isFinite(minutes) ? Math.max(Math.round(minutes), 0) : 0;
  const safeSeconds = Number.isFinite(seconds) ? Math.max(Math.round(seconds), 0) : 0;
  return clampDuration(safeMinutes * 60 + safeSeconds);
}

/** "0:30", "10:00", "1:05:00". Always reads as a clock, never as "600s". */
export function formatDuration(seconds: number | null | undefined): string {
  const total = clampDuration(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${minutes}:${pad(rest)}`;
}
