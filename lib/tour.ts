export type TourStepId =
  | 'menuChallenge'
  | 'menuCircle'
  | 'menuCallout'
  | 'menuJoin'
  | 'menuSendCoins'
  | 'coins'
  | 'money'
  | 'search'
  | 'dm'
  | 'bell'
  | 'official'
  | 'waves'
  | 'rounds'
  | 'plusCheckIn'
  | 'plusPost'
  | 'plusLift'
  | 'plusTimer'
  | 'plusWave'
  | 'plusRound'
  | 'plusFeed'
  | 'tabFriends'
  | 'tabYou';

export type TourPlacement = 'below' | 'above' | 'center-low';

export type TourPlusSheet = 'root' | 'post' | null;

export type TourStep = {
  id: TourStepId;
  target: string | null;
  placement: TourPlacement;
  title: string;
  body: string;
};

export const OFFICIAL_TOUR_TARGETS = ['tour-official-banner', 'tour-official'] as const;

export const ROUNDS_FALLBACK_BODY =
  'A Round is a longer clip (up to 3 minutes). Open + then Post, then Round. It shows here when a clip is tagged to a contest you are in.';

export const LOGO_MENU_TOUR_IDS: TourStepId[] = [
  'menuChallenge',
  'menuCircle',
  'menuCallout',
  'menuJoin',
  'menuSendCoins',
];

export const PLUS_ROOT_TOUR_IDS: TourStepId[] = ['plusCheckIn', 'plusPost', 'plusLift', 'plusTimer'];

export const PLUS_POST_TOUR_IDS: TourStepId[] = ['plusWave', 'plusRound', 'plusFeed'];

export function isHomeTourLogoMenuStep(id?: TourStepId | null): boolean {
  return Boolean(id && LOGO_MENU_TOUR_IDS.includes(id));
}

export function isHomeTourPlusRootStep(id?: TourStepId | null): boolean {
  return Boolean(id && PLUS_ROOT_TOUR_IDS.includes(id));
}

export function isHomeTourPlusPostStep(id?: TourStepId | null): boolean {
  return Boolean(id && PLUS_POST_TOUR_IDS.includes(id));
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'menuChallenge',
    target: 'tour-menu-challenge',
    placement: 'below',
    title: 'Create Challenge',
    body: 'Start a group skill contest. Lots of people, same task.',
  },
  {
    id: 'menuCircle',
    target: 'tour-menu-circle',
    placement: 'below',
    title: 'Create a Circle',
    body: 'A focus group for one thing you care about — running, reading, lifting. Talk and join contests together.',
  },
  {
    id: 'menuCallout',
    target: 'tour-menu-callout',
    placement: 'below',
    title: 'Call Someone Out',
    body: 'A 1-on-1 skill contest. Just you and one person.',
  },
  {
    id: 'menuJoin',
    target: 'tour-menu-join',
    placement: 'below',
    title: 'Join',
    body: 'Hop into a contest someone already made.',
  },
  {
    id: 'menuSendCoins',
    target: 'tour-menu-coins',
    placement: 'below',
    title: 'Send Coins',
    body: 'Send show-up coins to a friend. Coins are not cash.',
  },
  {
    id: 'coins',
    target: 'tour-coins',
    placement: 'below',
    title: 'Coins',
    body: 'Show-up coins. You earn them for logging in and keeping streaks. They are not cash.',
  },
  {
    id: 'money',
    target: 'tour-money',
    placement: 'below',
    title: 'Money',
    body: 'Real dollars. Used in paid contests. Coins and dollars do not swap.',
  },
  {
    id: 'search',
    target: 'tour-search',
    placement: 'below',
    title: 'Search',
    body: 'Find people and contests.',
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
    body: 'Friend requests, check-ins, and when you get paid. On the web this stays inside the app.',
  },
  {
    id: 'official',
    target: 'tour-official-banner',
    placement: 'below',
    title: 'Official',
    body: 'Contests Bob’s team runs. View or Join from this banner.',
  },
  {
    id: 'waves',
    target: 'tour-waves',
    placement: 'below',
    title: 'Waves',
    body: 'A Wave is a 30-second hello or pep talk — photo or video. It goes away after 24 hours. Your bubble always sits here.',
  },
  {
    id: 'rounds',
    target: 'tour-rounds',
    placement: 'below',
    title: 'Rounds',
    body: 'A Round is a longer clip (up to 3 minutes). Show how you train, invite people in, or cheer your Circle or Challenge. It does not go on Home unless you tap Share to Feed.',
  },
  {
    id: 'plusCheckIn',
    target: 'tour-plus-checkin',
    placement: 'above',
    title: 'Check In',
    body: 'How you compete. Submit proof you did the task so the contest can count it and keep score on the leaderboard.',
  },
  {
    id: 'plusPost',
    target: 'tour-plus-post-btn',
    placement: 'above',
    title: 'Post',
    body: 'Make a Wave, a Round, or a Home post. Next shows those three.',
  },
  {
    id: 'plusLift',
    target: 'tour-plus-lift',
    placement: 'above',
    title: 'Lift',
    body: 'Build a workout, save it, do it again, or send it to a friend.',
  },
  {
    id: 'plusTimer',
    target: 'tour-plus-timer',
    placement: 'above',
    title: 'Timer',
    body: 'Cardio, intervals, and sprints.',
  },
  {
    id: 'plusWave',
    target: 'tour-plus-wave',
    placement: 'above',
    title: 'Wave',
    body: 'A 30-second hello or pep talk. Gone in 24 hours.',
  },
  {
    id: 'plusRound',
    target: 'tour-plus-round',
    placement: 'above',
    title: 'Round',
    body: 'A longer clip (up to 3 minutes). Show how you train, invite people in, or cheer a Circle or Challenge.',
  },
  {
    id: 'plusFeed',
    target: 'tour-plus-feed',
    placement: 'above',
    title: 'Feed',
    body: 'A normal post on Home.',
  },
  {
    id: 'tabFriends',
    target: 'tour-tab-friends',
    placement: 'above',
    title: 'Friends',
    body: 'Ask to be friends. Approve people who ask you.\nCircles live on this tab too — topic focus groups, not contests.',
  },
  {
    id: 'tabYou',
    target: 'tour-tab-you',
    placement: 'above',
    title: 'You',
    body: 'Your profile and Settings. You can replay this tour from Settings.',
  },
];

/** Open the same chrome a tap uses. Close when the step is not hamburger / + / Post. */
export function homeTourChrome(stepId?: TourStepId | null): {
  logoMenu: boolean;
  plusSheet: TourPlusSheet;
} {
  if (isHomeTourLogoMenuStep(stepId)) {
    return { logoMenu: true, plusSheet: null };
  }
  if (isHomeTourPlusRootStep(stepId)) {
    return { logoMenu: false, plusSheet: 'root' };
  }
  if (isHomeTourPlusPostStep(stepId)) {
    return { logoMenu: false, plusSheet: 'post' };
  }
  return { logoMenu: false, plusSheet: null };
}

export function officialTourTarget(hasRect: (id: string) => boolean): string | null {
  for (const id of OFFICIAL_TOUR_TARGETS) {
    if (hasRect(id)) {
      return id;
    }
  }
  return null;
}

/** Hole this step’s control. Never fall back to Waves for hamburger / + rows. */
export function homeTourTarget(step: TourStep, hasRect: (id: string) => boolean): string | null {
  if (isHomeTourLogoMenuStep(step.id)) {
    return step.target;
  }
  if (step.id === 'official') {
    return officialTourTarget(hasRect);
  }
  if (step.id === 'rounds') {
    return hasRect('tour-rounds') ? 'tour-rounds' : hasRect('tour-waves') ? 'tour-waves' : 'tour-rounds';
  }
  if (isHomeTourPlusRootStep(step.id) || isHomeTourPlusPostStep(step.id)) {
    return step.target;
  }
  return step.target;
}

export function homeTourBody(step: TourStep, hasRect: (id: string) => boolean): string {
  if (step.id === 'rounds' && !hasRect('tour-rounds')) {
    return ROUNDS_FALLBACK_BODY;
  }
  return step.body;
}

/**
 * Skip one missing row after the host has waited.
 * If the hamburger / + chrome never opened, keep the card (do not skip the menu).
 */
export function shouldSkipHomeStep(step: TourStep, hasRect: (id: string) => boolean): boolean {
  if (isHomeTourLogoMenuStep(step.id)) {
    if (!hasRect('tour-menu-list')) {
      return false;
    }
    return Boolean(step.target && !hasRect(step.target));
  }
  if (isHomeTourPlusRootStep(step.id)) {
    if (!hasRect('tour-plus-root')) {
      return false;
    }
    return Boolean(step.target && !hasRect(step.target));
  }
  if (isHomeTourPlusPostStep(step.id)) {
    if (!hasRect('tour-plus-post') && !hasRect('tour-plus-wave') && !hasRect('tour-plus-round') && !hasRect('tour-plus-feed')) {
      return false;
    }
    return Boolean(step.target && !hasRect(step.target));
  }
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
