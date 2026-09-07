import { useEffect, useState } from 'react';

/** Long enough that a slow network still resolves normally, short enough to not read as frozen. */
export const STALL_MS = 8000;

/**
 * True once `waiting` has been continuously true for `ms`.
 *
 * A hung request looks exactly like a slow one from the client, so a screen that only branches on
 * "still loading" can sit on a spinner with no way out. Screens use this to offer a retry once the
 * wait stops being plausible. It resets the moment `waiting` clears, so a load that eventually
 * arrives never flashes the escape hatch.
 */
export function useStalled(waiting: boolean, ms: number = STALL_MS): boolean {
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    if (!waiting) {
      setStalled(false);
      return;
    }
    const handle = setTimeout(() => setStalled(true), ms);
    return () => clearTimeout(handle);
  }, [waiting, ms]);

  return stalled && waiting;
}
