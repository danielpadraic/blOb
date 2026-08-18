import { addDays } from 'date-fns';

import { defaultChallengeStart } from '@/lib/challengeSchedule';
import type { ChallengeCategory } from '@/lib/types';
import { DEFAULT_CREATE_VALUES } from '@/lib/challengeTemplates';
import {
  BEFORE_AFTER_HR_PRESET,
  SIMPLE_PROOF_CAP,
  defaultChallengeProofs,
  firstProofMethod,
  makeProof,
  proofRequirementsFrom,
  proofTypeFromMethod,
  type ChallengeProof,
  type ChallengeProofMethod,
} from '@/lib/challengeProofs';
import { copy } from '@/lib/copy';
import type { CreateChallengeValues } from '@/utils/validators';

export type SimpleCurrency = 'coins' | 'bucks';
export type SimpleVisibility = 'public' | 'friends' | 'invite';
export type SimpleProof = ChallengeProofMethod;
export type SimpleFrequency = 'once' | 'daily' | '3x_week' | 'custom';
export type SimpleDurationPreset = 1 | 7 | 30 | 'custom';
export type SimpleChallengeType =
  | 'running'
  | 'lifting'
  | 'steps'
  | 'cycling'
  | 'hiit'
  | 'sports'
  | 'productivity'
  | 'custom';

export const SIMPLE_TYPES: {
  value: SimpleChallengeType;
  label: string;
  icon: string;
  category: ChallengeCategory;
  activity: string;
}[] = [
  { value: 'running', label: 'Running', icon: '🏃', category: 'fitness', activity: 'running' },
  { value: 'lifting', label: 'Lifting', icon: '🏋', category: 'fitness', activity: 'lifting' },
  { value: 'steps', label: 'Steps', icon: '👟', category: 'fitness', activity: 'walking' },
  { value: 'cycling', label: 'Cycling', icon: '🚴', category: 'fitness', activity: 'cycling' },
  { value: 'hiit', label: 'HIIT', icon: '⚡', category: 'fitness', activity: 'hiit' },
  { value: 'sports', label: 'Sports', icon: '🏆', category: 'sports', activity: 'workout' },
  { value: 'productivity', label: 'Focus', icon: '🎯', category: 'productivity', activity: 'check-in' },
  { value: 'custom', label: 'Custom', icon: '✦', category: 'other', activity: 'custom' },
];

export const SIMPLE_DURATION_CHIPS: { value: SimpleDurationPreset; label: string }[] = [
  { value: 1, label: '1 day' },
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 'custom', label: 'Custom' },
];

export const SIMPLE_FREQUENCY_CHIPS: { value: SimpleFrequency; label: string }[] = [
  { value: 'once', label: 'Once' },
  { value: 'daily', label: 'Daily' },
  { value: '3x_week', label: '3×/week' },
  { value: 'custom', label: 'Custom' },
];

export const SIMPLE_PROOF_METHODS: { value: ChallengeProofMethod; label: string; icon: string }[] = [
  { value: 'photo', label: 'Photo', icon: '📷' },
  { value: 'video', label: 'Video', icon: '🎥' },
  { value: 'checkin', label: 'Check-in', icon: '✓' },
  { value: 'honor', label: 'Honor', icon: '🤝' },
  { value: 'hr', label: 'Heart rate', icon: '♥' },
];

export type SimpleChallengeDraft = {
  currency: SimpleCurrency;
  buy_in: number;
  host_budget: number;
  type: SimpleChallengeType;
  title: string;
  description: string;
  starts_at: string;
  duration_preset: SimpleDurationPreset;
  duration_days: number;
  task: string;
  frequency: SimpleFrequency;
  custom_checkins: number;
  proofs: ChallengeProof[];
  visibility: SimpleVisibility;
};

export function defaultSimpleDraft(now = new Date()): SimpleChallengeDraft {
  const starts = defaultChallengeStart(now);
  return {
    currency: 'coins',
    buy_in: 0,
    host_budget: 0,
    type: 'running',
    title: '',
    description: '',
    starts_at: starts.toISOString(),
    duration_preset: 7,
    duration_days: 7,
    task: '',
    frequency: 'daily',
    custom_checkins: 7,
    proofs: defaultChallengeProofs(),
    visibility: 'public',
  };
}

export function durationDaysOf(draft: SimpleChallengeDraft): number {
  if (draft.duration_preset === 'custom') {
    return Math.max(Math.floor(draft.duration_days) || 1, 1);
  }
  return draft.duration_preset;
}

export function requiredCheckinsOf(draft: SimpleChallengeDraft): number {
  const days = durationDaysOf(draft);
  if (draft.frequency === 'once') {
    return 1;
  }
  if (draft.frequency === 'daily') {
    return days;
  }
  if (draft.frequency === '3x_week') {
    return Math.max(Math.ceil((days / 7) * 3), 1);
  }
  return Math.max(Math.floor(draft.custom_checkins) || 1, 1);
}

export function endsAtOf(draft: SimpleChallengeDraft): string {
  const start = new Date(draft.starts_at);
  return addDays(start, durationDaysOf(draft)).toISOString();
}

export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function applyBeforeAfterHrPreset(): ChallengeProof[] {
  return BEFORE_AFTER_HR_PRESET.map((item) => makeProof(item.name, item.method));
}

export function addSimpleProof(proofs: ChallengeProof[]): ChallengeProof[] {
  if (proofs.length >= SIMPLE_PROOF_CAP) {
    return proofs;
  }
  return [...proofs, makeProof(copy('create.proofFallback'), 'photo')];
}

export function removeSimpleProof(proofs: ChallengeProof[], id: string): ChallengeProof[] {
  if (proofs.length <= 1) {
    return proofs;
  }
  return proofs.filter((item) => item.id !== id);
}

export function syncProofNameWithTask(
  proofs: ChallengeProof[],
  previousTask: string,
  nextTask: string,
): ChallengeProof[] {
  const previousDefault = previousTask.trim() || copy('create.proofFallback');
  const nextDefault = nextTask.trim() || copy('create.proofFallback');
  return proofs.map((item, index) => {
    if (index !== 0) {
      return item;
    }
    const name = item.name.trim();
    if (!name || name === previousDefault) {
      return { ...item, name: nextDefault };
    }
    return item;
  });
}

export function simpleDraftToCreateValues(draft: SimpleChallengeDraft): CreateChallengeValues {
  const type = SIMPLE_TYPES.find((item) => item.value === draft.type) ?? SIMPLE_TYPES[0];
  const days = durationDaysOf(draft);
  const required = requiredCheckinsOf(draft);
  const bucks = draft.currency === 'bucks';
  const invite = draft.visibility === 'invite';
  const buyIn = bucks ? 0 : Math.max(Math.floor(draft.buy_in) || 0, 0);
  const hostBudget = bucks ? Math.max(Math.floor(draft.host_budget) || 0, 0) : 0;
  const proofs = draft.proofs.length > 0 ? draft.proofs : defaultChallengeProofs(draft.task);
  const legacyTypes = proofRequirementsFrom(proofs).map((item) => item.type);

  return {
    ...DEFAULT_CREATE_VALUES,
    title: draft.title.trim(),
    description: draft.description.trim(),
    category: type.category,
    challenge_type: 'consistency',
    visibility: invite ? 'invite' : draft.visibility === 'friends' ? 'friends' : 'public',
    challenge_lane: 'coins',
    buy_in: String(buyIn),
    duration_type: 'fixed',
    starts_at: draft.starts_at,
    ends_at: endsAtOf(draft),
    end_mode: 'length',
    duration_value: String(days),
    duration_unit: 'days',
    duration_days: String(days),
    target_count: String(required),
    frequency: draft.frequency === 'once' ? 'once' : draft.frequency === '3x_week' ? '3x_week' : draft.frequency === 'custom' ? 'custom' : 'daily',
    rule_activity: type.activity,
    extra_rules: [],
    proofs: legacyTypes,
    challenge_proofs: proofs,
    tasks: DEFAULT_CREATE_VALUES.tasks,
    prize_structure: 'equal_split',
    funding_model: bucks ? 'creator' : 'participants',
    creator_contribution: String(hostBudget),
    participant_cap: 'unlimited',
    max_participants: '',
    min_participants: '2',
    misses_allowed: '0',
    proof_review: 'auto',
    proof_type: proofTypeFromMethod(firstProofMethod(proofs)) as CreateChallengeValues['proof_type'],
    task: draft.task.trim(),
    host_funded: bucks,
    host_budget: String(hostBudget),
    required_checkins: String(required),
    payout_mode: 'even_split_remaining',
    format: 'consistency',
    currency: bucks ? 'bucks' : 'coins',
    creator_participating: true,
    min_minutes: '1',
    cover_image_url: '',
    rules_video_url: '',
    rules: draft.task.trim(),
  };
}

export function validateSimpleDraft(draft: SimpleChallengeDraft): string | null {
  if (draft.currency === 'bucks' && Math.floor(draft.host_budget) < 1) {
    return copy('create.setHostPrize');
  }
  if (!draft.title.trim() || draft.title.trim().length < 3) {
    return copy('create.needTitle');
  }
  if (!draft.starts_at) {
    return copy('create.needStart');
  }
  const start = new Date(draft.starts_at);
  if (Number.isNaN(start.getTime()) || start.getTime() <= Date.now()) {
    return copy('create.startFuture');
  }
  if (durationDaysOf(draft) < 1) {
    return copy('create.needDuration');
  }
  if (!draft.task.trim()) {
    return copy('create.needTask');
  }
  if (draft.frequency === 'custom' && requiredCheckinsOf(draft) < 1) {
    return copy('create.needCheckins');
  }
  return null;
}
