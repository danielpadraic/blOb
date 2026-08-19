import { wizardStepIndex } from '@/lib/challengeTemplates';
import type { TourPlacement } from '@/lib/tour';

export type CreateTourTrack = 'simple' | 'advanced';

export type CreateTourStep = {
  id: string;
  target: string;
  placement: TourPlacement;
  title: string;
  body: string;
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
    id: 'simple-visibility',
    target: 'create-simple-visibility',
    placement: 'below',
    title: 'Who can join',
    body: 'Public is listed. Friends or invite-only stay quieter.',
  },
  {
    id: 'simple-currency',
    target: 'create-simple-currency',
    placement: 'below',
    title: 'Currency',
    body: 'Coin icon for Coins. $ icon for real money. Same toggle on Advanced.',
  },
  {
    id: 'simple-buyin',
    target: 'create-simple-buyin',
    placement: 'below',
    title: 'Buy-in',
    body: 'What each competitor pays to enter. 0 is free.',
  },
  {
    id: 'simple-start',
    target: 'create-simple-start',
    placement: 'below',
    title: 'Start',
    body: 'Date and time logging opens.',
  },
  {
    id: 'simple-duration',
    target: 'create-simple-duration',
    placement: 'below',
    title: 'Duration',
    body: 'How long the challenge runs.',
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
    id: 'simple-advanced',
    target: 'create-simple-advanced',
    placement: 'above',
    title: 'Advanced',
    body: 'Advanced is the other track — caps, misses, judging, and invite-only.',
  },
];

export const ADVANCED_CREATE_TOUR: CreateTourStep[] = [
  {
    id: 'adv-lane',
    target: 'create-challenge_lane',
    placement: 'below',
    wizardStep: LANE,
    title: 'Lane',
    body: 'Coin Challenge or Private. Private is invite-only and you fund the prize.',
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
    body: 'What kind of contest this is. Skill and effort only.',
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
    body: 'Public, friends, or invite-only.',
  },
  {
    id: 'adv-scoring',
    target: 'create-challenge_type',
    placement: 'below',
    wizardStep: TYPE,
    title: 'Scoring',
    body: 'Consistency logs on a schedule. Points rank a task list.',
  },
  {
    id: 'adv-starts',
    target: 'create-starts_at',
    placement: 'below',
    wizardStep: DURATION,
    title: 'Start',
    body: 'When logging opens. Local time, saved as UTC.',
  },
  {
    id: 'adv-end',
    target: 'create-end_mode',
    placement: 'below',
    wizardStep: DURATION,
    title: 'End',
    body: 'Pick an end date or a length from the start.',
  },
  {
    id: 'adv-duration',
    target: 'create-duration_type',
    placement: 'below',
    wizardStep: DURATION,
    title: 'Duration',
    body: 'Fixed dates, then judging and payout.',
  },
  {
    id: 'adv-prize',
    target: 'create-prize_structure',
    placement: 'below',
    wizardStep: PRIZE,
    title: 'Payout',
    body: 'How the prize pool splits when people finish.',
  },
  {
    id: 'adv-funding',
    target: 'create-funding_model',
    placement: 'below',
    wizardStep: FUNDING,
    title: 'Funding',
    body: 'Who puts money in the pool — competitors, you, or both.',
  },
  {
    id: 'adv-currency',
    target: 'create-currency',
    placement: 'below',
    wizardStep: ENTRY,
    title: 'Currency',
    body: 'Coin icon for Coins. $ icon for real money.',
  },
  {
    id: 'adv-buyin',
    target: 'create-buy_in',
    placement: 'below',
    wizardStep: ENTRY,
    title: 'Buy-in',
    body: 'What each competitor pays to enter. Free if you host the prize.',
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
    body: 'Too few people at start cancels and refunds coin buy-ins.',
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
    body: 'Auto accepts proofs. Host means you review them.',
  },
  {
    id: 'adv-host-join',
    target: 'create-creator_participating',
    placement: 'below',
    wizardStep: ENTRY,
    title: 'You compete',
    body: 'On if you are in it too. Off if you are hosting only.',
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
    body: 'Minutes, extra constraints, cover, and video if you need them.',
  },
  {
    id: 'adv-review',
    target: 'create-review',
    placement: 'above',
    wizardStep: REVIEW,
    title: 'Review',
    body: 'Check it, then publish. Skip this tour anytime — it does not block publish.',
  },
  {
    id: 'adv-simple',
    target: 'create-advanced-simple',
    placement: 'below',
    wizardStep: REVIEW,
    title: 'Simple',
    body: 'Simple is the other track if you want fewer fields.',
  },
];

export function createTourSteps(track: CreateTourTrack): CreateTourStep[] {
  return track === 'advanced' ? ADVANCED_CREATE_TOUR : SIMPLE_CREATE_TOUR;
}
