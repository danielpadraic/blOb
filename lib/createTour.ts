import { wizardStepIndex } from '@/lib/challengeTemplates';
import type { TourPlacement } from '@/lib/tour';

export type CreateTourTrack = 'simple' | 'advanced';

export type CreateTourStep = {
  id: string;
  target: string;
  placement: TourPlacement;
  title: string;
  body: string;
  titleBucks?: string;
  bodyBucks?: string;
  wizardStep?: number;
};

const LANE = wizardStepIndex('lane');
const START = wizardStepIndex('start');
const GOAL = wizardStepIndex('goal');
const TYPE = wizardStepIndex('type');
const DURATION = wizardStepIndex('duration');
const PRIZE = wizardStepIndex('prize');
const FUNDING = wizardStepIndex('funding');
const ENTRY = wizardStepIndex('entry');
const RULES = wizardStepIndex('rules');
const REVIEW = wizardStepIndex('review');

export const SIMPLE_CREATE_TOUR: CreateTourStep[] = [
  {
    id: 'simple-currency',
    target: 'create-simple-currency',
    placement: 'below',
    title: 'Currency',
    body: 'Coins are rewards. $ is real money.',
  },
  {
    id: 'simple-buyin',
    target: 'create-simple-buyin',
    placement: 'below',
    title: 'Entry fee',
    body: 'Each person pays this to join.',
    titleBucks: 'Total prize',
    bodyBucks: 'You fund this prize.',
  },
  {
    id: 'simple-type',
    target: 'create-simple-type',
    placement: 'below',
    title: 'Type',
    body: 'What kind of work, and Any Exercise is fine.',
  },
  {
    id: 'simple-start',
    target: 'create-simple-start',
    placement: 'below',
    title: 'Start',
    body: 'Choose the starting date and time of your challenge.',
  },
  {
    id: 'simple-duration',
    target: 'create-simple-duration',
    placement: 'below',
    title: 'Duration',
    body: 'How long it runs.',
  },
  {
    id: 'simple-task',
    target: 'create-simple-task',
    placement: 'below',
    title: 'Task',
    body: 'The thing people actually do.',
  },
  {
    id: 'simple-frequency',
    target: 'create-simple-frequency',
    placement: 'below',
    title: 'Frequency',
    body: 'How often they have to log.',
  },
  {
    id: 'simple-proof',
    target: 'create-simple-proof',
    placement: 'below',
    title: 'Proof',
    body: 'What they attach when they log.',
  },
  {
    id: 'simple-visibility',
    target: 'create-simple-visibility',
    placement: 'below',
    title: 'Who can join',
    body: 'Share your challenge publicly, with just your friends, or by invite only.',
  },
  {
    id: 'simple-advanced',
    target: 'create-simple-advanced',
    placement: 'above',
    title: 'Advanced',
    body: 'Craft more detailed challenges in the Advanced creation menu.',
  },
];

export const ADVANCED_CREATE_TOUR: CreateTourStep[] = [
  {
    id: 'adv-lane',
    target: 'create-challenge_lane',
    placement: 'below',
    wizardStep: LANE,
    title: 'Lane',
    body: 'Coin Challenge or Private.',
  },
  {
    id: 'adv-start',
    target: 'create-start',
    placement: 'below',
    wizardStep: START,
    title: 'Start from',
    body: 'Scratch, a template, or a previous challenge.',
  },
  {
    id: 'adv-category',
    target: 'create-category',
    placement: 'below',
    wizardStep: GOAL,
    title: 'Type',
    body: 'What kind of contest this is.',
  },
  {
    id: 'adv-title',
    target: 'create-title',
    placement: 'below',
    wizardStep: GOAL,
    title: 'Title',
    body: 'The name people see in the Lobby.',
  },
  {
    id: 'adv-description',
    target: 'create-description',
    placement: 'below',
    wizardStep: GOAL,
    title: 'What a win looks like',
    body: 'Who should join, and what finishing means.',
  },
  {
    id: 'adv-task',
    target: 'create-task',
    placement: 'below',
    wizardStep: GOAL,
    title: 'Task',
    body: 'The action people log.',
  },
  {
    id: 'adv-visibility',
    target: 'create-visibility',
    placement: 'below',
    wizardStep: GOAL,
    title: 'Visibility',
    body: 'Share your challenge publicly, with just your friends, or by invite only.',
  },
  {
    id: 'adv-scoring',
    target: 'create-challenge_type',
    placement: 'below',
    wizardStep: TYPE,
    title: 'Scoring',
    body: 'Consistency or a ranked task list.',
  },
  {
    id: 'adv-starts',
    target: 'create-starts_at',
    placement: 'below',
    wizardStep: DURATION,
    title: 'Start',
    body: 'Choose the starting date and time of your challenge.',
  },
  {
    id: 'adv-end',
    target: 'create-duration_value',
    placement: 'below',
    wizardStep: DURATION,
    title: 'Duration',
    body: 'How long it runs. End is the start plus those days.',
  },
  {
    id: 'adv-duration',
    target: 'create-duration_type',
    placement: 'below',
    wizardStep: DURATION,
    title: 'Schedule',
    body: 'Fixed dates, then judging and payout.',
  },
  {
    id: 'adv-prize',
    target: 'create-prize_structure',
    placement: 'below',
    wizardStep: PRIZE,
    title: 'Payout',
    body: 'How the prize splits.',
  },
  {
    id: 'adv-funding',
    target: 'create-funding_model',
    placement: 'below',
    wizardStep: FUNDING,
    title: 'Funding',
    body: 'Who puts money in the prize.',
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
    title: 'Entry fee',
    body: 'What each competitor pays to enter.',
  },
  {
    id: 'adv-cap',
    target: 'create-participant_cap',
    placement: 'below',
    wizardStep: ENTRY,
    title: 'Cap',
    body: 'Unlimited, or a max number of competitors.',
  },
  {
    id: 'adv-min',
    target: 'create-min_participants',
    placement: 'below',
    wizardStep: ENTRY,
    title: 'Min to start',
    body: 'Too few people cancels and refunds coins.',
  },
  {
    id: 'adv-misses',
    target: 'create-misses_allowed',
    placement: 'below',
    wizardStep: ENTRY,
    title: 'Misses',
    body: 'How many missed logs still keep someone in.',
  },
  {
    id: 'adv-judging',
    target: 'create-proof_review',
    placement: 'below',
    wizardStep: ENTRY,
    title: 'Judging',
    body: 'Auto accepts proofs. Host means you review.',
  },
  {
    id: 'adv-host-join',
    target: 'create-creator_participating',
    placement: 'below',
    wizardStep: ENTRY,
    title: 'You compete',
    body: 'On if you are in it too.',
  },
  {
    id: 'adv-proofs',
    target: 'create-proofs',
    placement: 'below',
    wizardStep: RULES,
    title: 'Proof',
    body: 'What people attach on each log.',
  },
  {
    id: 'adv-extras',
    target: 'create-extra_rules',
    placement: 'below',
    wizardStep: RULES,
    title: 'Extra rules',
    body: 'Minutes, constraints, cover, and video.',
  },
  {
    id: 'adv-review',
    target: 'create-review',
    placement: 'above',
    wizardStep: REVIEW,
    title: 'Review',
    body: 'Check it, then publish.',
  },
  {
    id: 'adv-simple',
    target: 'create-advanced-simple',
    placement: 'below',
    wizardStep: REVIEW,
    title: 'Simple',
    body: 'The other track if you want fewer fields.',
  },
];

export function createTourSteps(track: CreateTourTrack): CreateTourStep[] {
  return track === 'advanced' ? ADVANCED_CREATE_TOUR : SIMPLE_CREATE_TOUR;
}
