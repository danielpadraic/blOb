import { GLYPH, type GlyphId } from '@/components/ui/Glyph';
import type { ProfileBadgeTone } from '@/lib/types';

export type { ProfileBadgeTone };

export type ProfileBadge = {
  id: string;
  label: string;
  hint: string;
  glyph: GlyphId;
  tone: ProfileBadgeTone;
  earned: boolean;
};

export type BadgeInput = {
  completedCount: number;
  hostedCount: number;
  bestRun: number;
  coinsEarned: number;
  bucksEarned: number;
  calloutWins: number;
  officialJoined: boolean;
  officialCompleted: boolean;
  createdAt?: string | null;
};

const EARLY_CUTOFF = new Date('2026-09-01T00:00:00.000Z');

export function buildProfileBadges(input: BadgeInput): ProfileBadge[] {
  const early =
    Boolean(input.createdAt) && new Date(input.createdAt as string) < EARLY_CUTOFF;

  const catalog: ProfileBadge[] = [
    {
      id: 'on-the-map',
      label: 'On the map',
      hint: 'This blob has a home in the blobverse.',
      glyph: GLYPH.sparkle,
      tone: 'mint',
      earned: true,
    },
    {
      id: 'completer',
      label: 'Completer',
      hint: 'Finished a challenge.',
      glyph: GLYPH.check,
      tone: 'teal',
      earned: input.completedCount >= 1,
    },
    {
      id: 'host',
      label: 'Host',
      hint: 'Created a challenge for other blobs.',
      glyph: GLYPH.flag,
      tone: 'charcoal',
      earned: input.hostedCount >= 1,
    },
    {
      id: 'streak',
      label: input.bestRun >= 7 ? 'Week streak' : 'On a run',
      hint: 'Showed up several days in a row.',
      glyph: GLYPH.streak,
      tone: 'gold',
      earned: input.bestRun >= 3,
    },
    {
      id: 'official',
      label: input.officialCompleted ? 'Official finisher' : 'Official',
      hint: 'Joined an official blOb challenge.',
      glyph: GLYPH.star,
      tone: 'teal',
      earned: input.officialJoined || input.officialCompleted,
    },
    {
      id: 'early',
      label: 'Early blob',
      hint: 'Here before the rush.',
      glyph: GLYPH.leaf,
      tone: 'mint',
      earned: early,
    },
    {
      id: 'coin-earner',
      label: input.coinsEarned >= 250 ? 'Coin whale' : 'Coin earner',
      hint: 'Lifetime Coins from prizes.',
      glyph: GLYPH.crown,
      tone: 'gold',
      earned: input.coinsEarned >= 50,
    },
    {
      id: 'buck-earner',
      label: input.bucksEarned >= 50 ? 'High roller' : 'Cash winner',
      hint: 'Lifetime Bucks from real-money prizes.',
      glyph: GLYPH.crown,
      tone: 'green',
      earned: input.bucksEarned >= 10,
    },
    {
      id: 'callout',
      label: input.calloutWins >= 3 ? 'Rival' : 'Call-out winner',
      hint: 'Won a 1-on-1 call-out.',
      glyph: GLYPH.swords,
      tone: 'charcoal',
      earned: input.calloutWins >= 1,
    },
  ];

  return catalog;
}

export function officialFlags(
  rows: Array<{
    challenge: { is_official?: boolean | null };
    participation?: { status?: string | null; completed_at?: string | null } | null;
  }>,
): {
  officialJoined: boolean;
  officialCompleted: boolean;
} {
  let officialJoined = false;
  let officialCompleted = false;
  for (const row of rows) {
    if (!row.challenge.is_official) {
      continue;
    }
    officialJoined = true;
    if (
      row.participation?.status === 'completed' ||
      Boolean(row.participation?.completed_at)
    ) {
      officialCompleted = true;
    }
  }
  return { officialJoined, officialCompleted };
}

export const BADGE_TONE = {
  gold: { bg: '#FFF4D6', fg: '#8A6A12', ring: '#E6C35C' },
  green: { bg: '#E7F6EC', fg: '#1B7A4A', ring: '#7BC49A' },
  teal: { bg: '#E4F8F4', fg: '#1F6F63', ring: '#7DE2D1' },
  charcoal: { bg: '#ECECEC', fg: '#131515', ring: '#C8C8C8' },
  mint: { bg: '#F0FFFB', fg: '#339989', ring: '#7DE2D1' },
} as const;
