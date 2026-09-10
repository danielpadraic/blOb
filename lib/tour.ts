export type TourStepId =
  | 'menu'
  | 'coins'
  | 'money'
  | 'search'
  | 'dm'
  | 'bell'
  | 'official'
  | 'waves'
  | 'rounds'
  | 'tabCreate'
  | 'tabFriends'
  | 'tabYou';

export type TourPlacement = 'below' | 'above' | 'center-low';

export type TourStep = {
  id: TourStepId;
  target: string | null;
  placement: TourPlacement;
  title: string;
  body: string;
};

export const OFFICIAL_TOUR_TARGETS = ['tour-official-banner', 'tour-official'] as const;

export const ROUNDS_FALLBACK_BODY =
  'Rounds live under Post → Round, and here when a clip is tagged to a challenge you are in.';

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'menu',
    target: 'tour-menu',
    placement: 'below',
    title: 'Menu',
    body: 'Create a Challenge, Circle, Call out, Join, or Send Coins. These live here — not on the +.',
  },
  {
    id: 'coins',
    target: 'tour-coins',
    placement: 'below',
    title: 'Coins',
    body: 'Show-up rewards — login, streaks, firsts. Not Official entry.',
  },
  {
    id: 'money',
    target: 'tour-money',
    placement: 'below',
    title: 'Real money',
    body: 'Cash as $. Official and paid challenges. Not interchangeable with Coins.',
  },
  {
    id: 'search',
    target: 'tour-search',
    placement: 'below',
    title: 'Search',
    body: 'Find people and challenges.',
  },
  {
    id: 'dm',
    target: 'tour-dm',
    placement: 'below',
    title: 'Messages',
    body: 'Message anyone unless they blocked you.',
  },
  {
    id: 'bell',
    target: 'tour-bell',
    placement: 'below',
    title: 'Bell',
    body: 'Requests, check-ins, and payouts. On the web this stays in-app.',
  },
  {
    id: 'official',
    target: 'tour-official-banner',
    placement: 'below',
    title: 'Official',
    body: 'Upcoming Officials. View or Join from this banner.',
  },
  {
    id: 'waves',
    target: 'tour-waves',
    placement: 'below',
    title: 'Waves',
    body: 'Hello or a short thought. About 30 seconds. Yours always shows here.',
  },
  {
    id: 'rounds',
    target: 'tour-rounds',
    placement: 'below',
    title: 'Rounds',
    body: 'Longer demo, form, workout, or invite. Up to 3:00. Share to Feed only when you choose.',
  },
  {
    id: 'tabCreate',
    target: 'tour-tab-create',
    placement: 'above',
    title: '+',
    body: 'Quick Start. Check In is proof for a live challenge you picked. Post opens Wave, Round, or Feed.',
  },
  {
    id: 'tabFriends',
    target: 'tour-tab-friends',
    placement: 'above',
    title: 'Friends',
    body: 'Request and approve people. Circles are a standing crew with their own feed — not a pot.',
  },
  {
    id: 'tabYou',
    target: 'tour-tab-you',
    placement: 'above',
    title: 'You',
    body: 'Profile, Settings, and replay this tour. Lift is your private workout log — sets, cardio, a Tabata timer. Open it here. Your challenges live under the flag tab — Official, Active, Hosting, Ended.',
  },
];

export function officialTourTarget(hasRect: (id: string) => boolean): string | null {
  for (const id of OFFICIAL_TOUR_TARGETS) {
    if (hasRect(id)) {
      return id;
    }
  }
  return null;
}

export function homeTourTarget(step: TourStep, hasRect: (id: string) => boolean): string | null {
  if (step.id === 'official') {
    return officialTourTarget(hasRect);
  }
  if (step.id === 'rounds') {
    return hasRect('tour-rounds') ? 'tour-rounds' : hasRect('tour-waves') ? 'tour-waves' : 'tour-rounds';
  }
  return step.target;
}

export function homeTourBody(step: TourStep, hasRect: (id: string) => boolean): string {
  if (step.id === 'rounds' && !hasRect('tour-rounds')) {
    return ROUNDS_FALLBACK_BODY;
  }
  return step.body;
}

/** Missing Official banner or missing control → skip. Rounds stays and falls back to Waves. */
export function shouldSkipHomeStep(step: TourStep, hasRect: (id: string) => boolean): boolean {
  if (step.id === 'official') {
    return officialTourTarget(hasRect) == null;
  }
  if (step.id === 'rounds') {
    return !hasRect('tour-rounds') && !hasRect('tour-waves');
  }
  if (!step.target) {
    return false;
  }
  return !hasRect(step.target);
}

export function nextHomeTourIndex(
  from: number,
  direction: 1 | -1,
  hasRect: (id: string) => boolean,
  steps: TourStep[] = TOUR_STEPS,
): number {
  let index = from + direction;
  while (index >= 0 && index < steps.length) {
    if (!shouldSkipHomeStep(steps[index], hasRect)) {
      return index;
    }
    index += direction;
  }
  return direction > 0 ? steps.length : -1;
}
