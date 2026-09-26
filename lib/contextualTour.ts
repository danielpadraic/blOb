import type { TourPlacement } from '@/lib/tour';
import { wasHomeTourCompleted } from '@/lib/homeTour';
import { queryClient } from '@/lib/queryClient';
import { supabase } from '@/lib/supabase';
import { authStorage } from '@/lib/utils/secureStore';

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

export function parseContextualToursSeen(value: unknown): Set<ContextualTourId> {
  const next = new Set<ContextualTourId>();
  const list = Array.isArray(value)
    ? value
    : value && typeof value === 'object'
      ? Object.keys(value as Record<string, unknown>).filter((key) => (value as Record<string, unknown>)[key])
      : [];
  for (const id of list) {
    if (id === 'home-live-pills' || id === 'challenge-live' || id === 'lift') {
      next.add(id);
    }
  }
  return next;
}

export function profileHasContextualTour(
  profile: { contextual_tours_seen?: unknown } | null | undefined,
  id: ContextualTourId,
): boolean {
  return parseContextualToursSeen(profile?.contextual_tours_seen).has(id);
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
      for (const id of parseContextualToursSeen(raw ? JSON.parse(raw) : [])) {
        next.add(id);
      }
    }
  } catch {
    // In-memory is enough for this session until hydrate finishes.
  }
  memory.set(userId, next);
  return next;
}

function writeLocal(userId: string, seen: Set<ContextualTourId>) {
  memory.set(userId, seen);
  const payload = JSON.stringify([...seen]);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(storageKey(userId), payload);
    }
  } catch {
    // Keep the session flag.
  }
  void authStorage.setItem(storageKey(userId), payload).catch(() => undefined);
}

function patchProfileCache(userId: string, seen: Set<ContextualTourId>) {
  const list = [...seen];
  queryClient.setQueriesData({ queryKey: ['profile', userId] }, (current) => {
    if (!current || typeof current !== 'object') {
      return current;
    }
    return { ...current, contextual_tours_seen: list };
  });
}

async function persistProfileSeen(userId: string, seen: Set<ContextualTourId>) {
  patchProfileCache(userId, seen);
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ contextual_tours_seen: [...seen] })
      .eq('id', userId);
    if (error) {
      return;
    }
  } catch {
    // Local + memory still stand so this session does not loop.
  }
}

/** Load SecureStore / localStorage into memory after a cold start. */
export async function hydrateContextualTours(userId: string | null | undefined): Promise<void> {
  if (!userId) {
    return;
  }
  const merged = new Set(readLocal(userId));
  try {
    const raw = await authStorage.getItem(storageKey(userId));
    for (const id of parseContextualToursSeen(raw ? JSON.parse(raw) : [])) {
      merged.add(id);
    }
  } catch {
    // Memory / web localStorage still apply.
  }
  memory.set(userId, merged);
}

export function wasContextualTourSeen(
  userId: string | null | undefined,
  id: ContextualTourId,
  profile?: { contextual_tours_seen?: unknown; tutorial_completed_at?: string | null } | null,
): boolean {
  if (!userId) {
    return false;
  }
  if (
    (id === 'home-live-pills' || id === 'challenge-live') &&
    wasHomeTourCompleted(userId, profile?.tutorial_completed_at)
  ) {
    return true;
  }
  if (profileHasContextualTour(profile, id)) {
    return true;
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
  void persistProfileSeen(userId, seen);
}

function clearContextualId(userId: string, id: ContextualTourId) {
  const seen = new Set(readLocal(userId));
  seen.delete(id);
  writeLocal(userId, seen);
  void persistProfileSeen(userId, seen);
}

/** Replay first-run may show Home Live pills again if a pill is on screen. */
export function clearHomeLivePillsTour(userId: string | null | undefined) {
  if (!userId) {
    return;
  }
  clearContextualId(userId, 'home-live-pills');
}

/** Settings replay clears the Live room tour with the Home tour. No new row. */
export function clearChallengeLiveTour(userId: string | null | undefined) {
  if (!userId) {
    return;
  }
  clearContextualId(userId, 'challenge-live');
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
    title: 'Live rail',
    body: 'Official Weekly and Monthly Fitness sit here first. Quiet rooms are behind See More.',
  },
];

export const CHALLENGE_LIVE_STEPS: ContextualTourStep[] = [
  {
    id: 'challenge-live',
    target: 'tour-challenge-live',
    placement: 'above',
    title: 'Live',
    body: 'Live is the thread. Check-ins and chat for this room stay here.',
  },
];

export const CHALLENGE_LIVE_HOST_EMPTY_BODY =
  'This room is quiet. Check-ins and chat will show here.';

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
