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
const TYPE = wizardStepIndex('type');
const DURATION = wizardStepIndex('duration');
const RULES = wizardStepIndex('rules');

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
    id: 'adv-scoring',
    target: 'create-challenge_type',
    placement: 'below',
    wizardStep: TYPE,
    title: 'Scoring',
    body: 'Consistency, Points, or Cumulative. Payouts follow the format you pick.',
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
    id: 'adv-proofs',
    target: 'create-proofs',
    placement: 'below',
    wizardStep: RULES,
    title: 'Proof',
    body: 'What people attach on each check-in. Honor is allowed when you say so.',
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
