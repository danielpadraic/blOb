import type {
  ChallengeCategory,
  ChallengeFrequency,
  ChallengeKind,
  ChallengeVisibility,
  PrizeStructure,
  ProofType,
  ReactionType,
  TopPlacesDistribution,
  TopPlacesMode,
  FundingModel,
} from '@/lib/types';

export { COLORS, THEME } from '@/lib/theme';

export const APP_NAME = 'blOb';

export const OFFICIAL_CHALLENGE_TITLE =
  'Weekly Fitness Consistency Challenge';

export const SEED_CREDITS = 50;
export const DEFAULT_BUY_IN = 10;
export const DEFAULT_DAYS_REQUIRED = 6;
export const DEFAULT_MIN_MINUTES = 30;

export const STORAGE_BUCKETS = {
  avatars: 'avatars',
  challengeProofs: 'challenge-proofs',
  postMedia: 'post-media',
} as const;

export const ACTIVITY_OPTIONS = [
  'running',
  'lifting',
  'hiit',
  'cycling',
  'walking',
  'other',
] as const;

export const WORKOUT_FREQUENCY_OPTIONS = [2, 3, 4, 5, 6, 7] as const;

export const SKILL_TAGS = [
  'beginner',
  'intermediate',
  'advanced',
  'endurance',
  'strength',
  'mobility',
  'hyrox',
  'marathon',
] as const;

export const REACTION_META: Record<
  ReactionType,
  { label: string; glyph: string }
> = {
  like: { label: 'Like', glyph: '♥' },
  fire: { label: 'Fire', glyph: '🔥' },
  strong: { label: 'Strong', glyph: '◆' },
};

export const PROOF_TYPES = ['pre_selfie', 'post_selfie', 'hr_monitor'] as const;

export const CREATE_PROOF_TYPES = [
  'pre_selfie',
  'post_selfie',
  'hr_monitor',
  'photo',
  'screenshot',
  'text_note',
  'link',
  'video',
] as const satisfies readonly ProofType[];

export const IMAGE_PROOF_TYPES: readonly ProofType[] = [
  'pre_selfie',
  'post_selfie',
  'hr_monitor',
  'photo',
  'screenshot',
];

export const CHALLENGE_CATEGORIES = [
  'fitness',
  'sports',
  'productivity',
  'education',
  'creative',
  'reading',
  'gaming',
  'other',
] as const satisfies readonly ChallengeCategory[];

export const CHALLENGE_CATEGORY_LABEL: Record<ChallengeCategory, string> = {
  fitness: 'Fitness',
  sports: 'Sports',
  productivity: 'Productivity',
  education: 'Learning',
  creative: 'Creative',
  reading: 'Reading',
  gaming: 'Gaming',
  other: 'Other',
};

export function challengeCategoryLabel(value: string | null | undefined): string {
  return CHALLENGE_CATEGORY_LABEL[normalizeChallengeCategory(value, 'other')];
}

export function normalizeChallengeCategory(
  value: string | null | undefined,
  fallback: ChallengeCategory = 'fitness',
): ChallengeCategory {
  const raw = String(value ?? '').trim().toLowerCase();
  const mapped = raw === 'learning' ? 'education' : raw;
  if ((CHALLENGE_CATEGORIES as readonly string[]).includes(mapped)) {
    return mapped as ChallengeCategory;
  }
  return fallback;
}

export const CHALLENGE_TYPES = [
  {
    value: 'consistency',
    label: 'Consistency',
    helper: 'Log a required number of times on a schedule. Hit the target to finish.',
  },
  {
    value: 'points',
    label: 'Points',
    helper: 'Earn points by completing custom tasks. Each task has its own point value.',
  },
] as const satisfies readonly { value: ChallengeKind; label: string; helper: string }[];

export const CHALLENGE_FREQUENCIES = [
  {
    value: 'daily',
    label: 'Daily',
    helper: 'One successful log counts for that calendar day.',
  },
  {
    value: 'weekly',
    label: 'Weekly',
    helper: 'One successful log counts for that week.',
  },
  {
    value: 'monthly',
    label: 'Monthly',
    helper: 'One successful log counts for that month.',
  },
  {
    value: 'once',
    label: 'Once',
    helper: 'A one-shot target — usually a single log.',
  },
] as const satisfies readonly { value: ChallengeFrequency; label: string; helper: string }[];

export const CHALLENGE_VISIBILITY = [
  { value: 'public', label: 'Public', helper: 'Anyone in the Lobby can find and join it.' },
  { value: 'friends', label: 'Friends', helper: 'Only your friends can find and join it.' },
  { value: 'invite', label: 'Invite', helper: 'Only people you invite can join.' },
] as const satisfies readonly { value: ChallengeVisibility; label: string; helper: string }[];

export const PRIZE_STRUCTURES = [
  {
    value: 'equal_split',
    label: 'Split equally among completers',
    helper: 'Everyone who successfully finishes splits the prize pool evenly. This is how the official weekly challenge works.',
  },
  {
    value: 'winner_take_all',
    label: 'Winner takes all',
    helper: 'A single winner receives the entire prize pool.',
  },
  {
    value: 'top_places',
    label: 'Top places',
    helper: 'Only the top percent or top number of finishers share the pool — evenly, or scaled so 1st earns the most.',
  },
] as const satisfies readonly { value: PrizeStructure; label: string; helper: string }[];

export const TOP_PLACES_MODES = [
  { value: 'percent', label: 'Top percent' },
  { value: 'count', label: 'Top number' },
] as const satisfies readonly { value: TopPlacesMode; label: string }[];

export const TOP_PLACES_DISTRIBUTIONS = [
  {
    value: 'even',
    label: 'Evenly',
    helper: 'Those top places split the pool the same amount each.',
  },
  {
    value: 'scaled',
    label: 'Scaled',
    helper: '1st earns the most, then 2nd, then 3rd, on a simple decreasing split.',
  },
] as const satisfies readonly { value: TopPlacesDistribution; label: string; helper: string }[];

export const FUNDING_MODELS = [
  {
    value: 'participants',
    label: 'Competitor funded',
    helper: 'Only competitors pay a buy-in. Those Coins become the prize pool. This is the default.',
  },
  {
    value: 'creator',
    label: 'Creator funded',
    helper: 'You pay the prize pool up front from your Coins. Competitors can enter free, or pay a small optional fee.',
  },
  {
    value: 'hybrid',
    label: 'Hybrid',
    helper: 'You put in a base amount, and competitors also pay a buy-in. Both go into the pool.',
  },
] as const satisfies readonly { value: FundingModel; label: string; helper: string }[];

export const DURATION_PRESETS = [7, 14, 30] as const;

export const PROOF_META: Record<
  ProofType,
  { label: string; helper: string; short: string }
> = {
  pre_selfie: {
    label: 'Pre-workout selfie',
    helper: 'Face + gym or kit, before you start.',
    short: 'Pre-selfie',
  },
  post_selfie: {
    label: 'Post-workout selfie',
    helper: 'Same spot after you finish. Sweat is the point.',
    short: 'Post-selfie',
  },
  hr_monitor: {
    label: 'Heart-rate proof',
    helper: 'Watch or strap screenshot covering at least 30 minutes.',
    short: 'Heart rate',
  },
  photo: {
    label: 'Photo',
    helper: 'A clear photo of the work, the page, or the result.',
    short: 'Photo',
  },
  screenshot: {
    label: 'Screenshot',
    helper: 'A screen capture that shows you did the thing.',
    short: 'Screenshot',
  },
  text_note: {
    label: 'Text note',
    helper: 'A short written log of what you completed.',
    short: 'Note',
  },
  link: {
    label: 'Link',
    helper: 'A URL to the proof — Strava, repo, doc, clip, whatever is honest.',
    short: 'Link',
  },
  video: {
    label: 'Video',
    helper: 'A short clip of the activity or result.',
    short: 'Video',
  },
};

export function proofMeta(type: string): { label: string; helper: string; short: string } {
  return (
    PROOF_META[type as ProofType] ?? {
      label: type.replace(/_/g, ' '),
      helper: 'Attach this when you log a day.',
      short: type.replace(/_/g, ' '),
    }
  );
}

export function isImageProof(type: string): boolean {
  return (IMAGE_PROOF_TYPES as readonly string[]).includes(type);
}

export function isVideoProof(type: string): boolean {
  return type === 'video';
}

export const OFFICIAL_CHALLENGE = {
  title: OFFICIAL_CHALLENGE_TITLE,
  description:
    'Show up. Six days. Thirty honest minutes. Proof required — no honor system.',
  rules:
    'Complete 6 workouts of at least 30 minutes in 7 days. Each day you must submit a pre-selfie, a post-selfie, and a heart-rate monitor screenshot. Miss a required day and you are out. Prize pool is split equally among finishers.',
  buyIn: DEFAULT_BUY_IN,
  daysRequired: DEFAULT_DAYS_REQUIRED,
  windowDays: 7,
  minMinutes: DEFAULT_MIN_MINUTES,
} as const;

export const CHALLENGE_STATUS_LABEL: Record<string, string> = {
  upcoming: 'Upcoming',
  open: 'Open',
  starting: 'Starting',
  in_progress: 'In progress',
  judging: 'Judging',
  settled: 'Settled',
  cancelled_underfilled: 'Cancelled',
  cancelled: 'Cancelled',
};

export const LOBBY_CHALLENGE_STATUSES = [
  'open',
  'starting',
  'upcoming',
  'in_progress',
  'judging',
  'settled',
] as const;

/** Joinable Lobby / Discover statuses. Includes in_progress — sync flips open → in_progress after starts_at. */
export const DISCOVER_CHALLENGE_STATUSES = [
  'open',
  'upcoming',
  'starting',
  'in_progress',
] as const;

export const LOBBY_PAGE_SIZE = 40;

export const PUBLIC_PROFILE_COLUMNS =
  'id, username, display_name, avatar_url, bio, skill_tags, created_at, is_official';
