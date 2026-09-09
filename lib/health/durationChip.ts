/**
 * Compact duration for chips. Seconds stay visible; nothing is rounded to a whole minute.
 *
 * Under an hour: `mm:ss` (`35:00`). At or above 60 minutes: `h:mm:ss` (`1:05:12`).
 * The generated card keeps `0:35:00` — chips drop the leading hour when it is zero.
 */
export function formatHealthDuration(sec: number | null | undefined): string | null {
  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  const total = Math.round(n);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${mm}:${ss}`;
  }
  return `${mm}:${ss}`;
}

/**
 * Chip editor: `36:55` and `0:36:55` keep seconds. A bare `37` is still minutes for older muscle memory.
 */
export function parseHealthDurationInput(raw: string): number | null {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) {
    return null;
  }
  const hms = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (hms) {
    const seconds = Number(hms[1]) * 3600 + Number(hms[2]) * 60 + Number(hms[3]);
    return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : null;
  }
  const ms = trimmed.match(/^(\d{1,3}):(\d{2})$/);
  if (ms) {
    const seconds = Number(ms[1]) * 60 + Number(ms[2]);
    return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : null;
  }
  const minutes = Number(trimmed.replace(/,/g, ''));
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return null;
  }
  return Math.round(minutes * 60);
}
