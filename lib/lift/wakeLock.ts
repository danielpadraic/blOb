import { Platform } from 'react-native';

/**
 * Keeps the screen on while the Play timer runs.
 *
 * One of two defences against "my screen went off and the timer stopped". A locked screen
 * suspends JavaScript, so the interval stops firing and no cue can sound because nothing is
 * running to fire it. This avoids that suspension rather than trying to survive it, which is the
 * whole story on web — a backgrounded tab gets no reprieve.
 *
 * Native has the second defence: the timer holds a `mixWithOthers` audio session open (see
 * `cues.ts`), and an app playing audio keeps executing through a lock. So on a phone the clock
 * survives the screen going off; keep-awake mostly stops it going off in the first place.
 *
 * Either way the timer counts against wall time, so a suspension neither defence prevents still
 * resolves correctly on resume — the clock catches up instead of drifting.
 *
 * Every path is best-effort. A denied wake lock must never stop Play from running.
 */

const TAG = 'blob-lift-play';

/** The Screen Wake Lock API is not in the RN DOM typings, so its shape is declared here. */
type WakeLockSentinel = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: 'release', listener: () => void) => void;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinel> };
};

let sentinel: WakeLockSentinel | null = null;
let held = false;

async function acquireWeb(): Promise<void> {
  const scope =
    typeof navigator === 'undefined' ? null : (navigator as WakeLockNavigator).wakeLock ?? null;
  if (!scope || sentinel) {
    return;
  }
  try {
    sentinel = await scope.request('screen');
    // Browsers drop the lock whenever the tab hides, and they do not give it back on their own.
    // Forgetting the sentinel here is what lets `reacquire` pick a fresh one up on return.
    sentinel.addEventListener('release', () => {
      sentinel = null;
    });
  } catch {
    // Denied, unsupported, or not in a secure context. The timer still runs.
    sentinel = null;
  }
}

async function acquireNative(): Promise<void> {
  try {
    const KeepAwake = await import('expo-keep-awake');
    await KeepAwake.activateKeepAwakeAsync(TAG);
  } catch {
    // No keep-awake module or a platform that refuses it.
  }
}

export async function holdScreenAwake(): Promise<void> {
  held = true;
  if (Platform.OS === 'web') {
    await acquireWeb();
    return;
  }
  await acquireNative();
}

export async function releaseScreenAwake(): Promise<void> {
  held = false;
  if (Platform.OS === 'web') {
    const current = sentinel;
    sentinel = null;
    try {
      await current?.release();
    } catch {
      // Already gone.
    }
    return;
  }
  try {
    const KeepAwake = await import('expo-keep-awake');
    await KeepAwake.deactivateKeepAwake(TAG);
  } catch {
    // Nothing to release.
  }
}

/**
 * Takes the lock back after the tab returns to the foreground.
 *
 * A web wake lock is released the moment the tab hides and is not restored automatically, so
 * without this a single glance at another app would leave the rest of the workout unprotected.
 */
export async function reacquireScreenAwake(): Promise<void> {
  if (!held || Platform.OS !== 'web') {
    return;
  }
  await acquireWeb();
}
