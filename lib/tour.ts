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
  | 'plusPost'
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

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'menu',
    target: 'tour-menu-list',
    placement: 'below',
    title: 'This menu',
    body: [
      'Create Challenge — start a group skill contest. Lots of people, same task.',
      'Create a Circle — a focus group for one thing you care about (running, reading, lifting). Talk and join contests together.',
      'Call Someone Out — a 1-on-1 skill contest. Just you and one person.',
      'Join — hop into a contest someone already made.',
      'Send Coins — send show-up coins to a friend. Coins are not cash.',
    ].join('\n'),
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
    id: 'tabCreate',
    target: 'tour-plus-root',
    placement: 'above',
    title: '+',
    body: [
      'Check-In — How you compete. Submit proof you did the task so the contest can count it and keep score on the leaderboard.',
      'Post — make a Wave, a Round, or a Home post.',
      'Lift — build a workout, save it, do it again, or send it to a friend.',
      'Timer — cardio, intervals, and sprints.',
    ].join('\n'),
  },
  {
    id: 'plusPost',
    target: 'tour-plus-post',
    placement: 'above',
    title: 'Post',
    body: [
      'Wave — 30-second hello. Gone in 24 hours.',
      'Round — longer clip. Invite or teach. Up to 3 minutes.',
      'Feed — a normal Home post.',
    ].join('\n'),
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

/** Open the same chrome a tap uses. Close when the step is not menu / + / Post. */
export function homeTourChrome(stepId?: TourStepId | null): {
  logoMenu: boolean;
  plusSheet: TourPlusSheet;
} {
  if (stepId === 'menu') {
    return { logoMenu: true, plusSheet: null };
  }
  if (stepId === 'tabCreate') {
    return { logoMenu: false, plusSheet: 'root' };
  }
  if (stepId === 'plusPost') {
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

export function homeTourTarget(step: TourStep, hasRect: (id: string) => boolean): string | null {
  if (step.id === 'menu') {
    return hasRect('tour-menu-list') ? 'tour-menu-list' : 'tour-menu';
  }
  if (step.id === 'official') {
    return officialTourTarget(hasRect);
  }
  if (step.id === 'rounds') {
    return hasRect('tour-rounds') ? 'tour-rounds' : hasRect('tour-waves') ? 'tour-waves' : 'tour-rounds';
  }
  if (step.id === 'tabCreate') {
    return hasRect('tour-plus-root') ? 'tour-plus-root' : hasRect('tour-tab-create') ? 'tour-tab-create' : 'tour-plus-root';
  }
  if (step.id === 'plusPost') {
    if (hasRect('tour-plus-post')) {
      return 'tour-plus-post';
    }
    if (hasRect('tour-plus-root')) {
      return 'tour-plus-root';
    }
    return hasRect('tour-tab-create') ? 'tour-tab-create' : 'tour-plus-post';
  }
  return step.target;
}

export function homeTourBody(step: TourStep, hasRect: (id: string) => boolean): string {
  if (step.id === 'rounds' && !hasRect('tour-rounds')) {
    return ROUNDS_FALLBACK_BODY;
  }
  return step.body;
}

/** Missing Official banner or missing control → skip. Menu / + always keep the card. Rounds falls back to Waves. */
export function shouldSkipHomeStep(step: TourStep, hasRect: (id: string) => boolean): boolean {
  if (step.id === 'menu' || step.id === 'tabCreate' || step.id === 'plusPost') {
    return false;
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
