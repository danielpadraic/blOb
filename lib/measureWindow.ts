export type WindowRect = { x: number; y: number; width: number; height: number };

type Measurable = {
  measureInWindow?: (cb: (x: number, y: number, width: number, height: number) => void) => void;
};

/**
 * Guarded window measure. Callers must pass `ref.current` (or equivalent).
 * Missing node or missing `measureInWindow` (Expo web) → no-op, never throw.
 */
export function measureInWindowSafe(
  node: unknown,
  onMeasure: (rect: WindowRect) => void,
): boolean {
  if (node == null) {
    return false;
  }
  const host = node as Measurable;
  if (typeof host.measureInWindow !== 'function') {
    return false;
  }
  try {
    host.measureInWindow((x, y, width, height) => {
      onMeasure({ x, y, width, height });
    });
    return true;
  } catch {
    return false;
  }
}
