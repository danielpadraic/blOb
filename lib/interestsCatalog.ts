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

export type InterestChipDef = {
  slug: string;
  label: string;
  allowsIndoorOutdoor: boolean;
  ratingKind: 'dupr' | 'utr' | 'ntrp' | 'handicap' | 'mmr' | 'grade' | 'other' | null;
  qtyKind: 'pages_week' | 'books_year' | 'miles_outing' | 'sessions_week' | 'fasting_hours' | null;
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
  { slug: 'running', label: 'Running', allowsIndoorOutdoor: true, ratingKind: null, qtyKind: 'miles_outing' },
  { slug: 'lifting', label: 'Lifting', allowsIndoorOutdoor: true, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'walking', label: 'Walking', allowsIndoorOutdoor: true, ratingKind: null, qtyKind: 'miles_outing' },
  { slug: 'cycling', label: 'Cycling', allowsIndoorOutdoor: true, ratingKind: null, qtyKind: 'miles_outing' },
  { slug: 'hiit', label: 'HIIT', allowsIndoorOutdoor: true, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'yoga', label: 'Yoga', allowsIndoorOutdoor: true, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'swimming', label: 'Swimming', allowsIndoorOutdoor: true, ratingKind: null, qtyKind: 'miles_outing' },
  { slug: 'mobility', label: 'Mobility', allowsIndoorOutdoor: true, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'hyrox', label: 'Hyrox', allowsIndoorOutdoor: true, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'pilates', label: 'Pilates', allowsIndoorOutdoor: true, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'rowing', label: 'Rowing', allowsIndoorOutdoor: true, ratingKind: null, qtyKind: 'miles_outing' },
  { slug: 'other', label: 'Other', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: null, isOther: true },
];

const SPORTS: InterestChipDef[] = [
  { slug: 'pickleball', label: 'Pickleball', allowsIndoorOutdoor: true, ratingKind: 'dupr', qtyKind: null },
  { slug: 'tennis', label: 'Tennis', allowsIndoorOutdoor: true, ratingKind: 'utr', qtyKind: null },
  { slug: 'golf', label: 'Golf', allowsIndoorOutdoor: true, ratingKind: 'handicap', qtyKind: null },
  { slug: 'basketball', label: 'Basketball', allowsIndoorOutdoor: true, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'soccer', label: 'Soccer', allowsIndoorOutdoor: true, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'baseball', label: 'Baseball', allowsIndoorOutdoor: true, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'volleyball', label: 'Volleyball', allowsIndoorOutdoor: true, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'climbing', label: 'Climbing', allowsIndoorOutdoor: true, ratingKind: 'grade', qtyKind: null },
  { slug: 'martial_arts', label: 'Martial arts', allowsIndoorOutdoor: true, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'hockey', label: 'Hockey', allowsIndoorOutdoor: true, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'football', label: 'Football', allowsIndoorOutdoor: true, ratingKind: null, qtyKind: 'sessions_week' },
  { slug: 'other', label: 'Other', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: null, isOther: true },
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
  { slug: 'other', label: 'Other', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: null, isOther: true },
];

const RELATIONSHIPS: InterestChipDef[] = [
  { slug: 'dating', label: 'Dating', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: null },
  { slug: 'marriage', label: 'Marriage', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: null },
  { slug: 'friendship', label: 'Friendship', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: null },
  { slug: 'communication', label: 'Communication', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: null },
  { slug: 'family', label: 'Family', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: null },
  { slug: 'other', label: 'Other', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: null, isOther: true },
];

const ESPORTS: InterestChipDef[] = [
  { slug: 'league', label: 'League', allowsIndoorOutdoor: false, ratingKind: 'mmr', qtyKind: null },
  { slug: 'cs2', label: 'CS2', allowsIndoorOutdoor: false, ratingKind: 'mmr', qtyKind: null },
  { slug: 'valorant', label: 'Valorant', allowsIndoorOutdoor: false, ratingKind: 'mmr', qtyKind: null },
  { slug: 'dota_2', label: 'Dota 2', allowsIndoorOutdoor: false, ratingKind: 'mmr', qtyKind: null },
  { slug: 'mlbb', label: 'MLBB', allowsIndoorOutdoor: false, ratingKind: 'mmr', qtyKind: null },
  { slug: 'pubg_mobile', label: 'PUBG Mobile', allowsIndoorOutdoor: false, ratingKind: 'mmr', qtyKind: null },
  { slug: 'fortnite', label: 'Fortnite', allowsIndoorOutdoor: false, ratingKind: 'mmr', qtyKind: null },
  { slug: 'rocket_league', label: 'Rocket League', allowsIndoorOutdoor: false, ratingKind: 'mmr', qtyKind: null },
  { slug: 'apex', label: 'Apex', allowsIndoorOutdoor: false, ratingKind: 'mmr', qtyKind: null },
  { slug: 'cod', label: 'CoD', allowsIndoorOutdoor: false, ratingKind: 'mmr', qtyKind: null },
  { slug: 'ea_fc', label: 'EA FC', allowsIndoorOutdoor: false, ratingKind: 'mmr', qtyKind: null },
  { slug: 'nba_2k', label: 'NBA 2K', allowsIndoorOutdoor: false, ratingKind: 'mmr', qtyKind: null },
  { slug: 'sf_tekken', label: 'SF/Tekken', allowsIndoorOutdoor: false, ratingKind: 'mmr', qtyKind: null },
  { slug: 'smash', label: 'Smash', allowsIndoorOutdoor: false, ratingKind: 'mmr', qtyKind: null },
  { slug: 'starcraft_ii', label: 'StarCraft II', allowsIndoorOutdoor: false, ratingKind: 'mmr', qtyKind: null },
  { slug: 'free_fire', label: 'Free Fire', allowsIndoorOutdoor: false, ratingKind: 'mmr', qtyKind: null },
  { slug: 'other', label: 'Other', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: null, isOther: true },
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
  { slug: 'other', label: 'Other', allowsIndoorOutdoor: false, ratingKind: null, qtyKind: null, isOther: true },
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
