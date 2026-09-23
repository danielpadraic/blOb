/**
 * Hold + / −: first tick is the press, then ~3/sec after 300ms, then faster.
 * Release (or pointer up) stops. Same on web and native.
 */

export const HOLD_REPEAT_DELAY_MS = 300;
export const HOLD_REPEAT_START_MS = 333;
export const HOLD_REPEAT_MIN_MS = 50;

export function startHoldRepeat(
  onTick: () => void,
  options?: { delayMs?: number; startMs?: number; minMs?: number },
): () => void {
  const delayMs = options?.delayMs ?? HOLD_REPEAT_DELAY_MS;
  const minMs = options?.minMs ?? HOLD_REPEAT_MIN_MS;
  let interval = options?.startMs ?? HOLD_REPEAT_START_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const tick = () => {
    if (stopped) {
      return;
    }
    onTick();
    interval = Math.max(minMs, Math.round(interval * 0.82));
    timer = setTimeout(tick, interval);
  };

  timer = setTimeout(tick, delayMs);

  return () => {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}
