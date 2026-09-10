import type { TourPlacement } from '@/lib/tour';

/** First-seen surfaces. Home first-run stays on tutorial_completed_at. */
export type ContextualTourId = 'home-live-pills' | 'challenge-live' | 'lift';

export type ContextualTourStep = {
  id: string;
  target: string;
  placement: TourPlacement;
  title: string;
  body: string;
};

const STORAGE_PREFIX = 'blob:contextual-tour:';
const memory = new Map<string, Set<ContextualTourId>>();

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

function readLocal(userId: string): Set<ContextualTourId> {
  const cached = memory.get(userId);
  if (cached) {
    return cached;
  }
  const next = new Set<ContextualTourId>();
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(storageKey(userId));
      const parsed = raw ? (JSON.parse(raw) as unknown) : [];
      if (Array.isArray(parsed)) {
        for (const id of parsed) {
          if (id === 'home-live-pills' || id === 'challenge-live' || id === 'lift') {
            next.add(id);
          }
        }
      }
    }
  } catch {
    // In-memory is enough for this session.
  }
  memory.set(userId, next);
  return next;
}

function writeLocal(userId: string, seen: Set<ContextualTourId>) {
  memory.set(userId, seen);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(storageKey(userId), JSON.stringify([...seen]));
    }
  } catch {
    // Keep the session flag.
  }
}

export function wasContextualTourSeen(
  userId: string | null | undefined,
  id: ContextualTourId,
): boolean {
  if (!userId) {
    return false;
  }
  return readLocal(userId).has(id);
}

export function markContextualTourSeen(userId: string | null | undefined, id: ContextualTourId) {
  if (!userId) {
    return;
  }
  const seen = new Set(readLocal(userId));
  seen.add(id);
  writeLocal(userId, seen);
}

/** Replay first-run may show Home Live pills again if a pill is on screen. */
export function clearHomeLivePillsTour(userId: string | null | undefined) {
  if (!userId) {
    return;
  }
  const seen = new Set(readLocal(userId));
  seen.delete('home-live-pills');
  writeLocal(userId, seen);
}

export function resetContextualToursForTests() {
  memory.clear();
  try {
    if (typeof localStorage !== 'undefined') {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (key?.startsWith(STORAGE_PREFIX)) {
          keys.push(key);
        }
      }
      for (const key of keys) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Tests without storage.
  }
}

export const HOME_LIVE_PILLS_STEPS: ContextualTourStep[] = [
  {
    id: 'home-live',
    target: 'tour-live-pills',
    placement: 'below',
    title: 'Live',
    body: 'This is the locker-room thread for a challenge you are in. Check-ins land here. Open it to talk.',
  },
  {
    id: 'home-pulse',
    target: 'tour-live-pills',
    placement: 'below',
    title: 'Pulse',
    body: 'Pulse is live activity from challenges you are in. It is not the thread.',
  },
];

export const CHALLENGE_LIVE_STEPS: ContextualTourStep[] = [
  {
    id: 'challenge-live',
    target: 'tour-challenge-live',
    placement: 'above',
    title: 'Live',
    body: 'Your bubbles sit on the right. Everyone else is on the left. This room stays until the challenge ends — even if someone drops.',
  },
];

export const CHALLENGE_LIVE_HOST_EMPTY_BODY =
  'Quiet in this challenge. You can post — you do not have to join your own room.';

export const LIFT_HISTORY_STEPS: ContextualTourStep[] = [
  {
    id: 'lift-history',
    target: 'tour-lift-history',
    placement: 'below',
    title: 'Lift',
    body: 'Favorites, Drafts, Completed. Favorite is a pin. Share from all three. Completed is finished work plus weight moved.',
  },
  {
    id: 'lift-logging',
    target: 'tour-lift-history',
    placement: 'below',
    title: 'Logging',
    body: 'Open a session to log lifts. Cardio and Rest are chips and insertable rows. Play starts the timer. Save keeps a Draft. Complete is separate — leftover sets and cardio rounds must be Done or removed. Play opens a 3-second countdown and whistle on work, then a bell before rest. Interval ON / OFF / Rest stay on the same exercise.',
  },
];

export const LIFT_SESSION_STEPS: ContextualTourStep[] = [
  {
    id: 'lift-logging',
    target: 'tour-lift-log',
    placement: 'above',
    title: 'Logging',
    body: 'Roster of lifts. Cardio and Rest are chips and insertable rows. Footer: Play + Save session. Save keeps a Draft. Complete is separate — leftover sets and cardio rounds must be Done or removed.',
  },
];

export const LIFT_TABATA_STEP: ContextualTourStep = {
  id: 'lift-tabata',
  target: 'tour-lift-play',
  placement: 'above',
  title: 'Play',
  body: 'Play opens the timer. 3-second countdown and whistle on work. 3-second + bell before rest. Sounds mix with device music. Interval ON / OFF / Rest stay on the same exercise.',
};

export function liftSessionHasInterval(
  draft: { exercises?: Array<{ cardioType?: string | null; cardio_type?: string | null }> } | null | undefined,
): boolean {
  return (draft?.exercises ?? []).some((row) => (row.cardioType ?? row.cardio_type) === 'interval');
}

export function liftSessionTourSteps(
  draft: { exercises?: Array<{ cardioType?: string | null; cardio_type?: string | null }> } | null | undefined,
): ContextualTourStep[] {
  if (liftSessionHasInterval(draft)) {
    return [...LIFT_SESSION_STEPS, LIFT_TABATA_STEP];
  }
  return LIFT_SESSION_STEPS;
}
