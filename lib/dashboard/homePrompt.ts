import { authStorage } from '@/lib/utils/secureStore';

const seenAt = new Map<string, string>();
const dismissedAt = new Map<string, string>();

function seenKey(userId: string): string {
  return `blob:home-seen:${userId}`;
}

function dismissKey(userId: string): string {
  return `blob:home-prompt-dismiss:${userId}`;
}

function remember(map: Map<string, string>, userId: string, iso: string) {
  if (iso) {
    map.set(userId, iso);
  }
}

export async function hydrateHomePrompt(userId: string | null | undefined): Promise<void> {
  if (!userId) {
    return;
  }
  try {
    const [seen, dismissed] = await Promise.all([
      authStorage.getItem(seenKey(userId)),
      authStorage.getItem(dismissKey(userId)),
    ]);
    if (seen) {
      remember(seenAt, userId, seen);
    }
    if (dismissed) {
      remember(dismissedAt, userId, dismissed);
    }
  } catch {
    // Memory still applies for this visit.
  }
}

export function markHomeVisited(userId: string | null | undefined, at = new Date().toISOString()): void {
  if (!userId) {
    return;
  }
  remember(seenAt, userId, at);
  try {
    void Promise.resolve(authStorage.setItem(seenKey(userId), at)).catch(() => undefined);
  } catch {
    // The in-memory stamp still hides the line this visit.
  }
}

export function dismissHomePrompt(userId: string | null | undefined, postCreatedAt: string): void {
  if (!userId || !postCreatedAt) {
    return;
  }
  remember(dismissedAt, userId, postCreatedAt);
  try {
    void Promise.resolve(authStorage.setItem(dismissKey(userId), postCreatedAt)).catch(() => undefined);
  } catch {
    // Memory hides it until the next newer post this visit.
  }
}

/** True when this post is newer than the last Home visit and newer than Dismiss. */
export function homePromptVisible(
  userId: string | null | undefined,
  postCreatedAt: string | null | undefined,
): boolean {
  if (!userId || !postCreatedAt) {
    return false;
  }
  const post = Date.parse(postCreatedAt);
  if (!Number.isFinite(post)) {
    return false;
  }
  const seen = Date.parse(seenAt.get(userId) ?? '');
  const dismissed = Date.parse(dismissedAt.get(userId) ?? '');
  if (Number.isFinite(seen) && post <= seen) {
    return false;
  }
  if (Number.isFinite(dismissed) && post <= dismissed) {
    return false;
  }
  return true;
}
