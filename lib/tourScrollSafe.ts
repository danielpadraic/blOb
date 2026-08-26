type ScrollHost = {
  scrollTo?: (opts: { x?: number; y?: number; animated?: boolean }) => void;
  scrollToEnd?: (opts?: { animated?: boolean }) => void;
  scrollToOffset?: (opts: { offset: number; animated?: boolean }) => void;
  flashScrollIndicators?: () => void;
};

/**
 * Guarded scroll. Missing node or missing method (Expo web View/DOM/Animated) → no-op, never throw.
 */
export function scrollToSafe(
  node: unknown,
  opts: { x?: number; y?: number; animated?: boolean },
): boolean {
  if (node == null) {
    return false;
  }
  const host = node as ScrollHost;
  if (typeof host.scrollTo === 'function') {
    try {
      host.scrollTo(opts);
      return true;
    } catch {
      return false;
    }
  }
  if (typeof host.scrollToOffset === 'function' && typeof opts.y === 'number') {
    try {
      host.scrollToOffset({ offset: opts.y, animated: opts.animated });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function scrollToEndSafe(node: unknown, opts?: { animated?: boolean }): boolean {
  if (node == null) {
    return false;
  }
  const host = node as ScrollHost;
  if (typeof host.scrollToEnd !== 'function') {
    return false;
  }
  try {
    host.scrollToEnd(opts);
    return true;
  } catch {
    return false;
  }
}

export function scrollToOffsetSafe(
  node: unknown,
  opts: { offset: number; animated?: boolean },
): boolean {
  if (node == null) {
    return false;
  }
  const host = node as ScrollHost;
  if (typeof host.scrollToOffset !== 'function') {
    return false;
  }
  try {
    host.scrollToOffset(opts);
    return true;
  } catch {
    return false;
  }
}

export function flashScrollIndicatorsSafe(node: unknown): boolean {
  if (node == null) {
    return false;
  }
  const host = node as ScrollHost;
  if (typeof host.flashScrollIndicators !== 'function') {
    return false;
  }
  try {
    host.flashScrollIndicators();
    return true;
  } catch {
    return false;
  }
}
