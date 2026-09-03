export const INTEREST_ROOM_SLUGS = [
  'health_fitness',
  'sports',
  'personal_development',
  'relationships',
  'esports',
  'outdoors',
] as const;

export type InterestRoomSlug = (typeof INTEREST_ROOM_SLUGS)[number];

export type InterestRoomState = 'incomplete' | 'complete_empty' | 'complete_filled';

export type QtyPeriod = 'day' | 'week' | 'month' | 'year';

export type QtyKind =
  | 'pages_week'
  | 'books_year'
  | 'miles_outing'
  | 'sessions_week'
  | 'fasting_hours'
  | 'laps'
  | 'steps_day';

export type InterestChipDef = {
  slug: string;
  label: string;
  allowsIndoorOutdoor: boolean;
  ratingKind: 'dupr' | 'utr' | 'ntrp' | 'handicap' | 'mmr' | 'grade' | 'other' | null;
  qtyKind: QtyKind | null;
  defaultPeriod?: QtyPeriod;
  isWork?: boolean;
  isOther?: boolean;
};

export type InterestRoomDef = {
  slug: InterestRoomSlug;
  title: string;
  sub: string;
  chips: readonly InterestChipDef[];
};

const FITNESS: InterestChipDef[] = [
  { slug: 'running', label: 'Running', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'miles_outing' },
  { slug: 'lifting', label: 'Lifting', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'walking', label: 'Walking', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'steps_day', defaultPeriod: 'day' },
  { slug: 'cycling', label: 'Cycling', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'miles_outing' },
  { slug: 'hiit', label: 'HIIT', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'yoga', label: 'Yoga', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'swimming', label: 'Swimming', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'laps' },
  { slug: 'mobility', label: 'Mobility', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'diet_nutrition', label: 'Diet & Nutrition', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: null },
  { slug: 'hyrox', label: 'Hyrox', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'pilates', label: 'Pilates', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'rowing', label: 'Rowing', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'other', label: 'Other', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'sessions_week', isOther: true },
];

const SPORTS: InterestChipDef[] = [
  { slug: 'pickleball', label: 'Pickleball', allowsIndoorOutdoor: false, ratingKind: 'dupr', qtyKind: 'sessions_week' },
  { slug: 'tennis', label: 'Tennis', allowsIndoorOutdoor: false, ratingKind: 'utr', qtyKind: 'sessions_week' },
  { slug: 'golf', label: 'Golf', allowsIndoorOutdoor: false, ratingKind: 'handicap', qtyKind: 'sessions_week' },
  { slug: 'basketball', label: 'Basketball', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'soccer', label: 'Soccer', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'baseball', label: 'Baseball', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'volleyball', label: 'Volleyball', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'climbing', label: 'Climbing', allowsIndoorOutdoor: false, ratingKind: 'grade', qtyKind: 'sessions_week' },
  { slug: 'martial_arts', label: 'Martial arts', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'hockey', label: 'Hockey', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'football', label: 'Football', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'other', label: 'Other', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'sessions_week', isOther: true },
];

const PERSONAL: InterestChipDef[] = [
  { slug: 'academics', label: 'Academics', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: null },
  { slug: 'fasting', label: 'Fasting', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'fasting_hours' },
  { slug: 'work', label: 'Work', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: null, isWork: true },
  { slug: 'meditation', label: 'Meditation', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'reading', label: 'Reading', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'pages_week' },
  { slug: 'languages', label: 'Languages', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'music', label: 'Music', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'writing', label: 'Writing', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'pages_week' },
  { slug: 'other', label: 'Other', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'sessions_week', isOther: true },
];

const RELATIONSHIPS: InterestChipDef[] = [
  { slug: 'dating', label: 'Dating', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'marriage', label: 'Marriage', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'friendship', label: 'Friendship', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'communication', label: 'Communication', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'family', label: 'Family', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'other', label: 'Other', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'sessions_week', isOther: true },
];

const ESPORTS: InterestChipDef[] = [
  { slug: 'league', label: 'League', allowsIndoorOutdoor: false, ratingKind: 'mmr', qtyKind: 'sessions_week' },
  { slug: 'cs2', label: 'CS2', allowsIndoorOutdoor: false, ratingKind: 'mmr', qtyKind: 'sessions_week' },
  { slug: 'valorant', label: 'Valorant', allowsIndoorOutdoor: false, ratingKind: 'mmr', qtyKind: 'sessions_week' },
  { slug: 'dota_2', label: 'Dota 2', allowsIndoorOutdoor: false, ratingKind: 'mmr', qtyKind: 'sessions_week' },
  { slug: 'mlbb', label: 'MLBB', allowsIndoorOutdoor: false, ratingKind: 'mmr', qtyKind: 'sessions_week' },
  { slug: 'pubg_mobile', label: 'PUBG Mobile', allowsIndoorOutdoor: false, ratingKind: 'mmr', qtyKind: 'sessions_week' },
  { slug: 'fortnite', label: 'Fortnite', allowsIndoorOutdoor: false, ratingKind: 'mmr', qtyKind: 'sessions_week' },
  { slug: 'rocket_league', label: 'Rocket League', allowsIndoorOutdoor: false, ratingKind: 'mmr', qtyKind: 'sessions_week' },
  { slug: 'apex', label: 'Apex', allowsIndoorOutdoor: false, ratingKind: 'mmr', qtyKind: 'sessions_week' },
  { slug: 'cod', label: 'CoD', allowsIndoorOutdoor: false, ratingKind: 'mmr', qtyKind: 'sessions_week' },
  { slug: 'ea_fc', label: 'EA FC', allowsIndoorOutdoor: false, ratingKind: 'mmr', qtyKind: 'sessions_week' },
  { slug: 'nba_2k', label: 'NBA 2K', allowsIndoorOutdoor: false, ratingKind: 'mmr', qtyKind: 'sessions_week' },
  { slug: 'sf_tekken', label: 'SF/Tekken', allowsIndoorOutdoor: false, ratingKind: 'mmr', qtyKind: 'sessions_week' },
  { slug: 'smash', label: 'Smash', allowsIndoorOutdoor: false, ratingKind: 'mmr', qtyKind: 'sessions_week' },
  { slug: 'starcraft_ii', label: 'StarCraft II', allowsIndoorOutdoor: false, ratingKind: 'mmr', qtyKind: 'sessions_week' },
  { slug: 'free_fire', label: 'Free Fire', allowsIndoorOutdoor: false, ratingKind: 'mmr', qtyKind: 'sessions_week' },
  { slug: 'other', label: 'Other', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'sessions_week', isOther: true },
];

const OUTDOORS: InterestChipDef[] = [
  { slug: 'hiking', label: 'Hiking', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'miles_outing' },
  { slug: 'camping', label: 'Camping', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'fishing', label: 'Fishing', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'hunting', label: 'Hunting', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'trail_running', label: 'Trail running', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'miles_outing' },
  { slug: 'kayaking', label: 'Kayaking', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'miles_outing' },
  { slug: 'skiing', label: 'Skiing', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'snowboarding', label: 'Snowboarding', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'gardening', label: 'Gardening', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'other', label: 'Other', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: 'sessions_week', isOther: true },
];

export const INTEREST_ROOMS: readonly InterestRoomDef[] = [
  {
    slug: 'health_fitness',
    title: 'Health & Fitness',
    sub: 'Move, train, recover.',
    chips: FITNESS,
  },
  {
    slug: 'sports',
    title: 'Sports',
    sub: 'Play, practice, compete.',
    chips: SPORTS,
  },
  {
    slug: 'personal_development',
    title: 'Personal Development',
    sub: 'Study, work, and habits.',
    chips: PERSONAL,
  },
  {
    slug: 'relationships',
    title: 'Relationships',
    sub: 'How you show up with people.',
    chips: RELATIONSHIPS,
  },
  {
    slug: 'esports',
    title: 'eSports',
    sub: 'Games you play or want to climb.',
    chips: ESPORTS,
  },
  {
    slug: 'outdoors',
    title: 'Outdoors',
    sub: 'Trails, water, and weather.',
    chips: OUTDOORS,
  },
];

export const INTEREST_PROMPT = {
  title: 'What do you currently excel at or want to improve?',
  sub: 'This will help us improve your experience and design custom challenges and training.',
} as const;

export const ROOM_REQUEST = 'Which of these are you currently doing or would like to improve?';

export const NONE_CHIP_SLUG = 'none_of_these';

export const QTY_PERIODS = ['day', 'week', 'month', 'year'] as const;

export const QTY_PERIOD_LABELS: Record<QtyPeriod, string> = {
  day: 'Per day',
  week: 'Per week',
  month: 'Per month',
  year: 'Per year',
};

export function defaultQtyPeriod(chip: InterestChipDef): QtyPeriod {
  if (chip.defaultPeriod) {
    return chip.defaultPeriod;
  }
  if (chip.qtyKind === 'steps_day') {
    return 'day';
  }
  if (chip.qtyKind === 'books_year') {
    return 'year';
  }
  return 'week';
}

export function qtyPeriodsForChip(chip: InterestChipDef): readonly QtyPeriod[] {
  if (chip.qtyKind === 'steps_day') {
    return ['day'];
  }
  return QTY_PERIODS;
}

export function isInterestRoomSlug(value: string): value is InterestRoomSlug {
  return (INTEREST_ROOM_SLUGS as readonly string[]).includes(value);
}

export function roomDef(slug: InterestRoomSlug): InterestRoomDef {
  return INTEREST_ROOMS.find((room) => room.slug === slug) ?? INTEREST_ROOMS[0];
}

export function nextRoomSlug(slug: InterestRoomSlug): InterestRoomSlug | null {
  const index = INTEREST_ROOM_SLUGS.indexOf(slug);
  return INTEREST_ROOM_SLUGS[index + 1] ?? null;
}

export function chipDef(room: InterestRoomSlug, slug: string): InterestChipDef | null {
  return roomDef(room).chips.find((chip) => chip.slug === slug) ?? null;
}

export function isPlayCard(room: InterestRoomSlug): boolean {
  return room === 'sports' || room === 'esports';
}

export function showsHighestLevel(room: InterestRoomSlug): boolean {
  return room === 'sports';
}

export function isDietChip(slug: string): boolean {
  return slug === 'diet_nutrition';
}

export function showsGoalQty(room: InterestRoomSlug, chip: InterestChipDef): boolean {
  if (!chip.qtyKind || chip.qtyKind === 'fasting_hours') {
    return false;
  }
  if (isPlayCard(room)) {
    return false;
  }
  return true;
}
