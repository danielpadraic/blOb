/**
 * Live read cursor: per user + challenge, in memory and on the device.
 *
 * The server table is a backup. This store is what the thread reads first so a hard refresh
 * on Web still knows what was already seen, and so sitting on latest can clear “New” immediately.
 */

const memory = new Map<string, string>();

function storageKey(userId: string, challengeId: string): string {
  return `blob:live:lastRead:${userId}:${challengeId}`;
}

function memoryKey(userId: string, challengeId: string): string {
  return `${userId}:${challengeId}`;
}

function webStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** The later of two ISO timestamps. Invalid values drop out. */
export function laterLiveTimestamp(left?: string | null, right?: string | null): string | null {
  const a = left ? Date.parse(left) : NaN;
  const b = right ? Date.parse(right) : NaN;
  if (Number.isFinite(a) && Number.isFinite(b)) {
    return a >= b ? String(left) : String(right);
  }
  if (Number.isFinite(a)) {
    return String(left);
  }
  if (Number.isFinite(b)) {
    return String(right);
  }
  return null;
}

export function peekLiveLastRead(userId?: string | null, challengeId?: string | null): string | null {
  const user = String(userId ?? '').trim();
  const challenge = String(challengeId ?? '').trim();
  if (!user || !challenge) {
    return null;
  }
  const fromMemory = memory.get(memoryKey(user, challenge)) ?? null;
  const fromDevice = webStorage()?.getItem(storageKey(user, challenge)) ?? null;
  return laterLiveTimestamp(fromMemory, fromDevice);
}

/** Forward-only. An older write cannot reopen messages that were already marked read. */
export function writeLiveLastRead(
  userId?: string | null,
  challengeId?: string | null,
  at?: string | null,
): string | null {
  const user = String(userId ?? '').trim();
  const challenge = String(challengeId ?? '').trim();
  const next = laterLiveTimestamp(peekLiveLastRead(user, challenge), at);
  if (!user || !challenge || !next) {
    return next;
  }
  memory.set(memoryKey(user, challenge), next);
  try {
    webStorage()?.setItem(storageKey(user, challenge), next);
  } catch {
    // Private Safari / full disk — memory still holds the cursor for this session.
  }
  return next;
}

export function resetLiveLastReadForTests(): void {
  memory.clear();
  const store = webStorage();
  if (!store) {
    return;
  }
  const keys: string[] = [];
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (key?.startsWith('blob:live:lastRead:')) {
      keys.push(key);
    }
  }
  for (const key of keys) {
    store.removeItem(key);
  }
}
