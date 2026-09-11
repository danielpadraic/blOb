import { wizardStepIndex } from '@/lib/challengeTemplates';
import type { TourPlacement } from '@/lib/tour';

export type CreateTourTrack = 'simple' | 'advanced';

export type CreateTourStep = {
  id: string;
  target: string;
  placement: TourPlacement;
  title: string;
  body: string;
  titleCash?: string;
  bodyCash?: string;
  wizardStep?: number;
};

const LANE = wizardStepIndex('lane');
const GOAL = wizardStepIndex('goal');
const TYPE = wizardStepIndex('type');
const DURATION = wizardStepIndex('duration');
const PRIZE = wizardStepIndex('prize');
const ENTRY = wizardStepIndex('entry');
const RULES = wizardStepIndex('rules');
const REVIEW = wizardStepIndex('review');

export const SIMPLE_CREATE_TOUR: CreateTourStep[] = [
  {
    id: 'simple-type',
    target: 'create-simple-type',
    placement: 'below',
    title: 'Type',
    body: 'Kind of work. Any Exercise is fine.',
  },
  {
    id: 'simple-duration',
    target: 'create-simple-duration',
    placement: 'below',
    title: 'Duration',
    body: 'How long it runs. Consistency days use this length.',
  },
  {
    id: 'simple-proof',
    target: 'create-simple-proof',
    placement: 'below',
    title: 'Proof',
    body: 'What they attach. Photo means post a photo of the work.',
  },
  {
    id: 'simple-visibility',
    target: 'create-simple-visibility',
    placement: 'below',
    title: 'Who',
    body: 'Public, Friends, or invite. Corporate lock is Advanced.',
  },
];

export const ADVANCED_CREATE_TOUR: CreateTourStep[] = [
  {
    id: 'adv-lane',
    target: 'create-challenge_lane',
    placement: 'below',
    wizardStep: LANE,
    title: 'Lane',
    body: 'Coins, or a private / corporate room.',
  },
  {
    id: 'adv-title',
    target: 'create-title',
    placement: 'below',
    wizardStep: GOAL,
    title: 'What',
    body: 'Title people see. The task is the action they check in for.',
  },
  {
    id: 'adv-visibility',
    target: 'create-visibility',
    placement: 'below',
    wizardStep: GOAL,
    title: 'Who',
    body: 'Public, Friends, or invite.',
  },
  {
    id: 'adv-scoring',
    target: 'create-challenge_type',
    placement: 'below',
    wizardStep: TYPE,
    title: 'Scoring',
    body: 'Consistency or Points. Even-split and winner-take-all are the live payouts.',
  },
  {
    id: 'adv-starts',
    target: 'create-starts_at',
    placement: 'below',
    wizardStep: DURATION,
    title: 'Start',
    body: 'Date and time this opens.',
  },
  {
    id: 'adv-duration',
    target: 'create-duration_value',
    placement: 'below',
    wizardStep: DURATION,
    title: 'Duration',
    body: 'How long it runs. End is the start plus these days.',
  },
  {
    id: 'adv-prize',
    target: 'create-prize_structure',
    placement: 'below',
    wizardStep: PRIZE,
    title: 'Payout',
    body: 'How the prize splits for this format.',
  },
  {
    id: 'adv-currency',
    target: 'create-currency',
    placement: 'below',
    wizardStep: ENTRY,
    title: 'Currency',
    body: 'Coins are rewards. $ is real money.',
  },
  {
    id: 'adv-buyin',
    target: 'create-buy_in',
    placement: 'below',
    wizardStep: ENTRY,
    title: 'Who pays',
    body: 'Coins: each competitor pays to enter.',
    titleCash: 'Who pays',
    bodyCash: 'You fund the prize. Participants do not buy in.',
  },
  {
    id: 'adv-limits',
    target: 'create-min_participants',
    placement: 'below',
    wizardStep: ENTRY,
    title: 'Min and cap',
    body: 'Too few people cancels. Cap is optional.',
  },
  {
    id: 'adv-misses',
    target: 'create-misses_allowed',
    placement: 'below',
    wizardStep: ENTRY,
    title: 'Misses',
    body: 'How many missed check-ins still keep someone in. Consistency only.',
  },
  {
    id: 'adv-proofs',
    target: 'create-proofs',
    placement: 'below',
    wizardStep: RULES,
    title: 'Proof',
    body: 'What people attach on each check-in. Honor is allowed when you say so.',
  },
  {
    id: 'adv-review',
    target: 'create-review',
    placement: 'above',
    wizardStep: REVIEW,
    title: 'Review',
    body: 'Check it, then publish. A missing highlight never blocks Publish.',
  },
];

export function createTourSteps(track: CreateTourTrack): CreateTourStep[] {
  return track === 'advanced' ? ADVANCED_CREATE_TOUR : SIMPLE_CREATE_TOUR;
}

const CREATE_TOUR_PREFIX = 'blob:create-tour-dismissed:';
const createDismissedIds = new Set<string>();

function createTourStorageKey(userId: string): string {
  return `${CREATE_TOUR_PREFIX}${userId}`;
}

export function markCreateTourDismissed(userId: string | null | undefined) {
  if (!userId) {
    return;
  }
  createDismissedIds.add(userId);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(createTourStorageKey(userId), '1');
    }
  } catch {
    // Session flag still blocks a second open this visit.
  }
}

export function wasCreateTourDismissed(
  userId: string | null | undefined,
  createTourOptOutAt?: string | null,
): boolean {
  if (createTourOptOutAt) {
    return true;
  }
  if (!userId) {
    return false;
  }
  if (createDismissedIds.has(userId)) {
    return true;
  }
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(createTourStorageKey(userId)) === '1') {
      createDismissedIds.add(userId);
      return true;
    }
  } catch {
    // In-memory is enough until the profile row returns.
  }
  return false;
}

export function resetCreateTourDismissedForTests() {
  createDismissedIds.clear();
}
