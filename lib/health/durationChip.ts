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
