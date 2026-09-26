export type TourStepId =
  | 'homeFeed'
  | 'officialFitness'
  | 'plusCheckIn'
  | 'challengePage'
  | 'consistency'
  | 'reminders';

export type TourPlacement = 'below' | 'above' | 'center-low';

export type TourPlusSheet = 'root' | 'post' | null;

export type TourStep = {
  id: TourStepId;
  target: string | null;
  placement: TourPlacement;
  title: string;
  body: string;
};

/** Center cards. A missing measure is not a reason to skip or finish. */
export const TOUR_STEPS: TourStep[] = [
  {
    id: 'homeFeed',
    target: null,
    placement: 'center-low',
    title: 'Home',
    body: 'Home is the feed. Official Weekly and Monthly Fitness sit on the Live rail first. Quiet rooms are behind See More.',
  },
  {
    id: 'officialFitness',
    target: null,
    placement: 'center-low',
    title: 'Official Fitness',
    body: 'Official Fitness is free coins. Each check-in is a pre-workout selfie, a post-workout selfie, and 30 minutes of elevated heart rate. Weekly is this week. Monthly is this month. A mid-join counts only the days left.',
  },
  {
    id: 'plusCheckIn',
    target: null,
    placement: 'center-low',
    title: 'Check In',
    body: '+ is Check In or Post. Check In picks the room, then the proof camera.',
  },
  {
    id: 'challengePage',
    target: null,
    placement: 'center-low',
    title: 'Challenge',
    body: 'A challenge page is Overview (the rules), then Board (the standing), then Live (the thread).',
  },
  {
    id: 'consistency',
    target: null,
    placement: 'center-low',
    title: 'Consistency',
    body: 'Consistency is one complete check-in per challenge-day. Points and miles can log more than once. Honor rooms, like Rookies vs. Veterans, log the day’s numbers.',
  },
  {
    id: 'reminders',
    target: null,
    placement: 'center-low',
    title: 'Reminders',
    body: 'Check-in reminders name the room and open Overview.',
  },
];

export function isHomeTourLogoMenuStep(_id?: TourStepId | null): boolean {
  return false;
}

export function isHomeTourPlusRootStep(_id?: TourStepId | null): boolean {
  return false;
}

export function isHomeTourPlusPostStep(_id?: TourStepId | null): boolean {
  return false;
}

export function homeTourChrome(_stepId?: TourStepId | null): {
  logoMenu: boolean;
  plusSheet: TourPlusSheet;
} {
  return { logoMenu: false, plusSheet: null };
}

export function homeTourTarget(step: TourStep, _hasRect: (id: string) => boolean): string | null {
  return step.target;
}

export function homeTourBody(step: TourStep, _hasRect: (id: string) => boolean): string {
  return step.body;
}

/** A card with no hole still counts. Missing measure does not skip it. */
export function shouldSkipHomeStep(step: TourStep, hasRect: (id: string) => boolean): boolean {
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
