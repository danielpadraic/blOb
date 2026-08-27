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

export const OFFICIAL_CHALLENGE_TITLE = 'Weekly $10 Guarantee';

export const SEED_CREDITS = 100;
export const DEFAULT_BUY_IN = 10;
export const DEFAULT_DAYS_REQUIRED = 6;
export const DEFAULT_MIN_MINUTES = 30;

export const STORAGE_BUCKETS = {
  avatars: 'avatars',
  challengeProofs: 'challenge-proofs',
  postMedia: 'post-media',
  bugReports: 'bug-reports',
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
  love: { label: 'Love', glyph: '♡' },
  care: { label: 'Care', glyph: '☺' },
  fire: { label: 'Fire', glyph: '🔥' },
  sad: { label: 'Sad', glyph: '·' },
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
  'distance',
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
    helper: 'Check in a required number of times on a schedule. Hit the target to finish.',
  },
  {
    value: 'cumulative',
    label: 'Cumulative',
    helper: 'Add up distance over the window. Everyone who hits the total splits the prize.',
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
    helper: 'One successful check-in counts for that calendar day.',
  },
  {
    value: 'weekly',
    label: 'Weekly',
    helper: 'One successful check-in counts for that week.',
  },
  {
    value: 'monthly',
    label: 'Monthly',
    helper: 'One successful check-in counts for that month.',
  },
  {
    value: 'once',
    label: 'Once',
    helper: 'A one-shot target — usually a single check-in.',
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
    label: 'Prize split evenly',
    helper: 'Everyone who successfully finishes splits the prize evenly. This is how the official weekly challenge works.',
  },
  {
    value: 'winner_take_all',
    label: 'Winner take all',
    helper: 'A single winner receives the entire prize.',
  },
  {
    value: 'top_places',
    label: 'Top places',
    helper: 'Only the top percent or top number of finishers share the prize — evenly, or scaled so 1st earns the most.',
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
    helper: 'Those top places split the prize the same amount each.',
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
    helper: 'Only competitors pay an entry fee. Those Coins become the prize. This is the default.',
  },
  {
    value: 'creator',
    label: 'Creator funded',
    helper: 'You pay the prize up front from your Coins. Competitors can enter free, or pay a small optional fee.',
  },
  {
    value: 'hybrid',
    label: 'Hybrid',
    helper: 'You put in a base amount, and competitors also pay an entry fee. Both go into the prize.',
  },
] as const satisfies readonly { value: FundingModel; label: string; helper: string }[];

export const DURATION_PRESETS = [1, 7, 30] as const;

export const PROOF_META: Record<
  ProofType,
  { label: string; helper: string; short: string }
> = {
  pre_selfie: {
    label: 'Post a pre-workout selfie.',
    helper: 'Face + gym or kit, before you start.',
    short: 'Pre-selfie',
  },
  post_selfie: {
    label: 'Post a post-workout selfie.',
    helper: 'Same spot after you finish. Sweat is the point.',
    short: 'Post-selfie',
  },
  hr_monitor: {
    label: 'Share proof of at least 30 minutes of elevated heart rate.',
    helper: 'Fitness or watch screenshot covering at least 30 minutes. A Watch is optional.',
    short: 'Heart rate',
  },
  photo: {
    label: 'Post a photo of the work.',
    helper: 'A clear photo of the work, the page, or the result.',
    short: 'Photo',
  },
  screenshot: {
    label: 'Post a screenshot of the work.',
    helper: 'A screen capture that shows you did the thing.',
    short: 'Screenshot',
  },
  text_note: {
    label: 'Write a short note that you did the work.',
    helper: 'A short written note of what you completed.',
    short: 'Note',
  },
  link: {
    label: 'Share a link that proves you did the work.',
    helper: 'A URL to the proof — Strava, repo, doc, clip, whatever is honest.',
    short: 'Link',
  },
  video: {
    label: 'Post a video of the work.',
    helper: 'A short clip of the activity or result.',
    short: 'Video',
  },
  distance: {
    label: 'Attach a run or walk of at least 1.00 miles.',
    helper: 'A Health workout or typed miles. A photo alone is not enough.',
    short: 'Distance',
  },
};

export function proofMeta(type: string): { label: string; helper: string; short: string } {
  return (
    PROOF_META[type as ProofType] ?? {
      label: type.replace(/_/g, ' '),
      helper: 'Attach this when you check in.',
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
    'Show up every day. Thirty honest minutes. A picture before, a picture after, and heart-rate proof — screenshot is enough.',
  rules:
    'Complete 6 workouts of at least 30 minutes in 7 days. Each required day needs a pre-workout selfie, a post-workout selfie, and proof of at least 30-minutes of elevated heart rate. Official days end at 11:59 p.m. Central Time. If 10+ finish (or everyone), prize split evenly. If fewer, they split the $10 prize.',
  buyIn: DEFAULT_BUY_IN,
  daysRequired: DEFAULT_DAYS_REQUIRED,
  windowDays: 7,
  minMinutes: DEFAULT_MIN_MINUTES,
} as const;

export const CHALLENGE_STATUS_LABEL: Record<string, string> = {
  upcoming: 'Upcoming',
  open: 'Open',
  starting: 'Starting',
  filling: 'Filling',
  arming: 'Arming',
  live: 'Live',
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
  'filling',
  'arming',
  'live',
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

/** Never include gender or pronoun — those stay on the owner profile only. */
export const PUBLIC_PROFILE_COLUMNS_BASE =
  'id, username, display_name, avatar_url, cover_url, bio, skill_tags, created_at, is_official';

export const PUBLIC_PROFILE_COLUMNS =
  `${PUBLIC_PROFILE_COLUMNS_BASE}, is_creator, allow_profile_posts, profile_visibility`;
