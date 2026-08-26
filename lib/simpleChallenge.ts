import { defaultChallengeStart, endsAtFromStartAndDays } from '@/lib/challengeSchedule';
import type { Challenge, ChallengeCategory } from '@/lib/types';
import { DEFAULT_CREATE_VALUES } from '@/lib/challengeTemplates';
import {
  BEFORE_AFTER_HR_PRESET,
  SIMPLE_PROOF_CAP,
  defaultChallengeProofs,
  defaultSentenceForMethod,
  ensureProofSentence,
  firstProofMethod,
  makeProof,
  proofRequirementsFrom,
  proofTypeFromMethod,
  resolveChallengeProofs,
  type ChallengeProof,
  type ChallengeProofMethod,
} from '@/lib/challengeProofs';
import { resolveDiscoverability } from '@/lib/challengeDiscoverability';
import { extraTasksFromStored, filledExtraTasks } from '@/lib/challengeCreatePublish';
import { isUnlimitedChallenge, normalizeFrequency, normalizeTasks } from '@/lib/challenges';
import { DEFAULT_MIN_MINUTES } from '@/lib/constants';
import type { ExtraCreateTask } from '@/utils/validators';
import { emptyExtraCreateTask } from '@/utils/validators';
import { challengeRulesFromCreateValues } from '@/lib/challengeRuleCopy';
import { copy } from '@/lib/copy';
import type { CreateChallengeValues } from '@/utils/validators';
import { asPrivacyMode, type PrivacyMode } from '@/lib/privacyMode';

export type SimpleCurrency = 'coins' | 'bucks';
export type SimpleVisibility = 'public' | 'friends' | 'invite';
export type SimpleProof = ChallengeProofMethod;
export type SimpleFrequency = 'once' | 'daily' | '3x_week' | 'custom';
export type SimpleCustomPeriod = 'day' | 'week' | 'month' | 'duration';
export type SimpleDurationPreset = 1 | 7 | 30 | 'custom';
export type SimpleChallengeType =
  | 'any_exercise'
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
  { value: 'any_exercise', label: 'Any Exercise', icon: '', category: 'fitness', activity: 'any exercise' },
  { value: 'running', label: 'Running', icon: '🏃', category: 'fitness', activity: 'running' },
  { value: 'lifting', label: 'Lifting', icon: '🏋', category: 'fitness', activity: 'lifting' },
  { value: 'steps', label: 'Steps', icon: '👟', category: 'fitness', activity: 'walking' },
  { value: 'cycling', label: 'Cycling', icon: '🚴', category: 'fitness', activity: 'cycling' },
  { value: 'hiit', label: 'HIIT', icon: '⚡', category: 'fitness', activity: 'HIIT' },
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

export const SIMPLE_CUSTOM_PERIODS: { value: SimpleCustomPeriod; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'duration', label: 'Duration of challenge' },
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
  guarantee_enabled?: boolean;
  type: SimpleChallengeType;
  title: string;
  description: string;
  starts_at: string;
  duration_preset: SimpleDurationPreset;
  duration_days: number;
  task: string;
  frequency: SimpleFrequency;
  custom_checkins: number;
  custom_period: SimpleCustomPeriod;
  proofs: ChallengeProof[];
  extra_tasks: ExtraCreateTask[];
  visibility: SimpleVisibility;
  privacy_mode: PrivacyMode;
  friends_of_friends: boolean;
  min_participants: number;
  cover_image_url: string;
};

export function defaultSimpleDraft(now = new Date()): SimpleChallengeDraft {
  const starts = defaultChallengeStart(now);
  return {
    currency: 'coins',
    buy_in: 0,
    host_budget: 0,
    guarantee_enabled: true,
    type: 'any_exercise',
    title: '',
    description: '',
    starts_at: starts.toISOString(),
    duration_preset: 7,
    duration_days: 7,
    task: '',
    frequency: 'daily',
    custom_checkins: 7,
    custom_period: 'week',
    proofs: defaultChallengeProofs(),
    extra_tasks: [],
    visibility: 'public',
    privacy_mode: 'public',
    friends_of_friends: true,
    min_participants: 2,
    cover_image_url: '',
  };
}

function withProofSentences(draft: SimpleChallengeDraft): SimpleChallengeDraft {
  const privacy_mode = asPrivacyMode(draft.privacy_mode, draft.visibility, 'coins');
  return {
    ...draft,
    extra_tasks: Array.isArray(draft.extra_tasks) ? draft.extra_tasks : [],
    proofs: (draft.proofs ?? []).map((item) => ensureProofSentence(item, item.minutes ?? 30)),
    cover_image_url: draft.cover_image_url?.trim() || '',
    privacy_mode,
    guarantee_enabled:
      privacy_mode === 'private_corporate'
        ? draft.guarantee_enabled === true
        : draft.guarantee_enabled !== false,
    friends_of_friends: privacy_mode === 'private_corporate' ? false : draft.friends_of_friends,
    visibility: privacy_mode === 'private_corporate' ? 'invite' : draft.visibility,
  };
}

const SIMPLE_DRAFT_KEY = 'blob.simpleCreateDraft';
const SIMPLE_DRAFT_TTL_MS = 2 * 60 * 60 * 1000;
let simpleDraftMemory: { draft: SimpleChallengeDraft; savedAt: number } | null = null;

function isFreshSimpleDraft(savedAt: number): boolean {
  return Date.now() - savedAt < SIMPLE_DRAFT_TTL_MS;
}

export function persistSimpleDraft(draft: SimpleChallengeDraft) {
  const payload = { draft, savedAt: Date.now() };
  simpleDraftMemory = payload;
  try {
    sessionStorage.setItem(SIMPLE_DRAFT_KEY, JSON.stringify(payload));
  } catch {
    // Native / private mode — memory is enough for this session.
  }
}

export function readPersistedSimpleDraft(): SimpleChallengeDraft | null {
  try {
    const raw = sessionStorage.getItem(SIMPLE_DRAFT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { draft?: SimpleChallengeDraft; savedAt?: number };
      if (parsed?.draft && typeof parsed.savedAt === 'number' && isFreshSimpleDraft(parsed.savedAt)) {
        const draft = withProofSentences(parsed.draft);
        simpleDraftMemory = { draft, savedAt: parsed.savedAt };
        return draft;
      }
    }
  } catch {
    // Ignore unavailable storage.
  }
  if (simpleDraftMemory && isFreshSimpleDraft(simpleDraftMemory.savedAt)) {
    return withProofSentences(simpleDraftMemory.draft);
  }
  return null;
}

export function clearPersistedSimpleDraft() {
  simpleDraftMemory = null;
  try {
    sessionStorage.removeItem(SIMPLE_DRAFT_KEY);
  } catch {
    // Ignore unavailable storage.
  }
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
  const n = Math.max(Math.floor(draft.custom_checkins) || 1, 1);
  if (draft.custom_period === 'day') {
    return n * days;
  }
  if (draft.custom_period === 'week') {
    return n * Math.max(Math.ceil(days / 7), 1);
  }
  if (draft.custom_period === 'month') {
    return n * Math.max(Math.ceil(days / 30), 1);
  }
  return n;
}

export function customFrequencyCopy(n: number, period: SimpleCustomPeriod): string {
  const count = Math.max(Math.floor(n) || 1, 1);
  if (period === 'day') {
    return `${count} each day`;
  }
  if (period === 'week') {
    return `${count} each week`;
  }
  if (period === 'month') {
    return `${count} each month`;
  }
  return `${count} over the whole challenge`;
}

export function frequencyHintOf(draft: SimpleChallengeDraft): string {
  const extra = filledExtraTasks(draft);
  if (draft.frequency === 'once') {
    return 'The task once for the whole challenge.';
  }
  if (draft.frequency === 'daily') {
    return extra.length > 0
      ? 'Every task, every day, unless a task is marked Once.'
      : 'The task once each day.';
  }
  if (draft.frequency === '3x_week') {
    return 'The task three times each week.';
  }
  return customFrequencyCopy(draft.custom_checkins, draft.custom_period);
}

function publishFrequencyOf(draft: SimpleChallengeDraft): CreateChallengeValues['frequency'] {
  if (draft.frequency === 'once') {
    return 'once';
  }
  if (draft.frequency === '3x_week') {
    return '3x_week';
  }
  if (draft.frequency === 'custom') {
    if (draft.custom_period === 'day' && draft.custom_checkins === 1) {
      return 'daily';
    }
    if (draft.custom_period === 'week' && draft.custom_checkins === 1) {
      return 'weekly';
    }
    if (draft.custom_period === 'week' && draft.custom_checkins === 3) {
      return '3x_week';
    }
    if (draft.custom_period === 'month') {
      return 'monthly';
    }
    return 'custom';
  }
  return 'daily';
}

function publishCadenceOf(draft: SimpleChallengeDraft): string {
  if (draft.frequency === 'custom') {
    if (draft.custom_period === 'day' && draft.custom_checkins === 1) {
      return 'daily';
    }
    if (draft.custom_period === 'week' && draft.custom_checkins === 1) {
      return 'weekly';
    }
    if (draft.custom_period === 'week' && draft.custom_checkins === 3) {
      return '3x_week';
    }
    if (draft.custom_period === 'month') {
      return 'monthly';
    }
    if (draft.custom_period === 'duration') {
      return draft.custom_checkins <= 1 ? 'once' : 'custom';
    }
  }
  return publishFrequencyOf(draft);
}

export function endsAtOf(draft: SimpleChallengeDraft): string {
  return endsAtFromStartAndDays(draft.starts_at, durationDaysOf(draft));
}

export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function applyBeforeAfterHrPreset(): ChallengeProof[] {
  return BEFORE_AFTER_HR_PRESET.map((item) => makeProof(item.name, item.method, item.minutes));
}

export function addSimpleProof(proofs: ChallengeProof[]): ChallengeProof[] {
  if (proofs.length >= SIMPLE_PROOF_CAP) {
    return proofs;
  }
  return [...proofs, makeProof(defaultSentenceForMethod('photo'), 'photo')];
}

export function removeSimpleProof(proofs: ChallengeProof[], id: string): ChallengeProof[] {
  if (proofs.length <= 1) {
    return proofs;
  }
  return proofs.filter((item) => item.id !== id);
}

export function syncProofNameWithTask(
  proofs: ChallengeProof[],
  _previousTask: string,
  _nextTask: string,
): ChallengeProof[] {
  return proofs.map((item, index) => {
    if (index !== 0) {
      return item;
    }
    if (!item.name.trim() || item.name.trim() === copy('create.proofFallback')) {
      return { ...item, name: defaultSentenceForMethod(item.method) };
    }
    return item;
  });
}

export function simpleDraftToCreateValues(draft: SimpleChallengeDraft): CreateChallengeValues {
  const type = SIMPLE_TYPES.find((item) => item.value === draft.type) ?? SIMPLE_TYPES[0];
  const days = durationDaysOf(draft);
  const required = requiredCheckinsOf(draft);
  const bucks = draft.currency === 'bucks';
  const corporate = draft.privacy_mode === 'private_corporate';
  const invite = corporate || draft.visibility === 'invite';
  const buyIn = bucks || corporate ? 0 : Math.max(Number(draft.buy_in) || 0, 0);
  const hostContribution = Math.max(Number(draft.host_budget) || 0, 0);
  const fundingModel =
    buyIn > 0 && hostContribution > 0 ? 'hybrid' : hostContribution > 0 ? 'creator' : 'participants';
  const extra_tasks = filledExtraTasks(draft);
  const proofs = (draft.proofs.length > 0 ? draft.proofs : defaultChallengeProofs()).map((item) =>
    ensureProofSentence(item, item.minutes ?? DEFAULT_MIN_MINUTES),
  );
  const legacyTypes = proofRequirementsFrom(proofs).map((item) => item.type);
  const hrMinutes = [
    ...proofs.filter((item) => item.method === 'hr').map((item) => item.minutes ?? DEFAULT_MIN_MINUTES),
    ...extra_tasks.filter((item) => item.proof_method === 'hr').map((item) => item.hr_minutes),
  ];
  const minMinutes = hrMinutes.length > 0 ? Math.max(...hrMinutes, 1) : DEFAULT_MIN_MINUTES;
  const values: CreateChallengeValues = {
    ...DEFAULT_CREATE_VALUES,
    title: draft.title.trim(),
    description: draft.description.trim(),
    category: type.category,
    challenge_type: 'consistency',
    visibility: invite ? 'invite' : draft.visibility === 'friends' ? 'friends' : 'public',
    privacy_mode: corporate ? 'private_corporate' : asPrivacyMode(draft.privacy_mode, invite ? 'invite' : draft.visibility, 'coins'),
    discoverability: corporate
      ? 'invite_only'
      : resolveDiscoverability({
          visibility: invite ? 'invite' : draft.visibility,
          currency: draft.currency,
          friendsOfFriends: draft.friends_of_friends,
        }),
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
    frequency: publishFrequencyOf(draft),
    rule_activity: type.activity,
    extra_rules: [],
    extra_tasks,
    proofs: legacyTypes,
    challenge_proofs: proofs,
    tasks: DEFAULT_CREATE_VALUES.tasks,
    prize_structure: 'equal_split',
    funding_model: fundingModel,
    creator_contribution: String(hostContribution),
    participant_cap: 'unlimited',
    max_participants: '',
    min_participants: String(Math.max(Number(draft.min_participants) || 2, 2)),
    misses_allowed: '0',
    proof_review: 'auto',
    proof_type: proofTypeFromMethod(firstProofMethod(proofs)) as CreateChallengeValues['proof_type'],
    task: draft.task.trim(),
    host_funded: bucks || hostContribution > 0,
    host_budget: String((draft.guarantee_enabled ?? false) ? hostContribution : 0),
    guarantee_enabled: draft.guarantee_enabled ?? !corporate,
    required_checkins: String(required),
    payout_mode: 'even_split_remaining',
    format: 'consistency',
    currency: bucks ? 'bucks' : 'coins',
    creator_participating: true,
    min_minutes: String(minMinutes),
    cover_image_url: draft.cover_image_url?.trim() || '',
    rules_video_url: '',
    rules: '',
  };
  values.rules = challengeRulesFromCreateValues({
    ...values,
    frequency: publishCadenceOf(draft),
  });
  return values;
}

export function simpleDraftFromChallenge(challenge: Challenge): SimpleChallengeDraft {
  const unlimited = isUnlimitedChallenge(challenge);
  let days = Math.max(Number(challenge.length_value) || 0, 0);
  if (!days && !unlimited && challenge.starts_at && challenge.ends_at) {
    const start = Date.parse(challenge.starts_at);
    const end = Date.parse(challenge.ends_at);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      days = Math.max(1, Math.round((end - start) / (24 * 60 * 60 * 1000)));
    }
  }
  days = Math.min(365, Math.max(days || 7, 1));
  const duration_preset: SimpleDurationPreset = days === 1 || days === 7 || days === 30 ? days : 'custom';
  const freq = normalizeFrequency(challenge.frequency);
  const frequency: SimpleFrequency =
    freq === 'once' || freq === 'daily' || freq === '3x_week' ? freq : 'custom';
  const type =
    SIMPLE_TYPES.find((item) => item.activity === String(challenge.task ?? '').toLowerCase()) ??
    SIMPLE_TYPES.find((item) => item.category === challenge.category) ??
    SIMPLE_TYPES.find((item) => item.value === 'custom') ??
    SIMPLE_TYPES[0];
  const visibility: SimpleVisibility =
    challenge.visibility === 'friends'
      ? 'friends'
      : challenge.visibility === 'invite' || challenge.visibility === 'private'
        ? 'invite'
        : 'public';
  const privacy_mode = asPrivacyMode(challenge.privacy_mode, challenge.visibility, challenge.challenge_lane);
  return {
    currency: challenge.currency === 'bucks' ? 'bucks' : 'coins',
    buy_in:
      challenge.currency === 'bucks' ? 0 : Math.max(Number(challenge.buy_in_amount) || 0, 0),
    host_budget: Math.max(Number(challenge.creator_contribution) || 0, 0),
    guarantee_enabled: Math.max(Number(challenge.host_budget) || 0, 0) > 0,
    type: type.value,
    title: challenge.title,
    description: challenge.description ?? '',
    starts_at: challenge.starts_at,
    duration_preset,
    duration_days: days,
    task: challenge.task ?? '',
    frequency,
    custom_checkins: Math.max(Number(challenge.required_checkins ?? challenge.target_count) || days, 1),
    custom_period: 'duration',
    proofs: resolveChallengeProofs({
      proofs: challenge.proofs,
      proof_type: challenge.proof_type,
      proof_requirements: challenge.proof_requirements,
      min_minutes: challenge.min_minutes,
    }),
    extra_tasks: extraTasksFromStored(normalizeTasks(challenge.tasks), challenge.task),
    visibility,
    privacy_mode,
    friends_of_friends:
      privacy_mode === 'private_corporate' ? false : challenge.discoverability === 'friends_of_friends',
    min_participants: Math.max(Number(challenge.min_participants) || 2, 2),
    cover_image_url: challenge.cover_image_url?.trim() || '',
  };
}

export function validateSimpleDraft(
  draft: SimpleChallengeDraft,
  options?: { allowStart?: string | null },
): string | null {
  if (!draft.title.trim() || draft.title.trim().length < 3) {
    return copy('create.needTitle');
  }
  if (!draft.starts_at) {
    return copy('create.needStart');
  }
  const start = new Date(draft.starts_at);
  const startOk =
    !Number.isNaN(start.getTime()) &&
    (start.getTime() > Date.now() || Boolean(options?.allowStart && draft.starts_at === options.allowStart));
  if (!startOk) {
    return copy('create.startFuture');
  }
  if (Math.max(Number(draft.min_participants) || 0, 0) < 2) {
    return copy('create.minToStartHint');
  }
  if (durationDaysOf(draft) < 1) {
    return copy('create.needDuration');
  }
  if (!draft.task.trim()) {
    return copy('create.needTask');
  }
  if ((draft.extra_tasks ?? []).some((item) => !item.title.trim())) {
    return copy('create.needExtraTask');
  }
  if (draft.frequency === 'custom' && requiredCheckinsOf(draft) < 1) {
    return copy('create.needCheckins');
  }
  if (draft.currency === 'bucks' && Math.max(Number(draft.buy_in) || 0, 0) > 0) {
    return 'The host funds the prize. Participants do not pay an entry.';
  }
  return null;
}
