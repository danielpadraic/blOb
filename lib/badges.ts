import { GLYPH, type GlyphId } from '@/components/ui/Glyph';
import { supabase } from '@/lib/supabase';
import type { BadgeDefinition, ProfileBadgeTone, UserBadge } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';

export type NewBadge = {
  key: string;
  title: string;
  coin_reward: number;
};

const BADGE_COLUMNS =
  'key, name, description, icon, tone, coin_reward, metric, threshold, tier, sort_order';

const USER_BADGE_COLUMNS = 'user_id, badge_key, earned_at, coin_reward';

export type BadgeWithProgress = BadgeDefinition & {
  earned: boolean;
  earnedAt: string | null;
  awardedCoins: number;
};

const ICON_MAP: Record<string, GlyphId> = {
  sparkle: GLYPH.sparkle,
  check: GLYPH.check,
  flag: GLYPH.flag,
  streak: GLYPH.streak,
  star: GLYPH.star,
  crown: GLYPH.crown,
  swords: GLYPH.swords,
  people: GLYPH.people,
  leaf: GLYPH.leaf,
  person: GLYPH.person,
};

export function badgeGlyph(icon: string | null | undefined): GlyphId {
  return ICON_MAP[icon ?? ''] ?? GLYPH.sparkle;
}

export function badgeTone(tone: string | null | undefined): ProfileBadgeTone {
  if (tone === 'gold' || tone === 'green' || tone === 'charcoal' || tone === 'mint') {
    return tone;
  }
  return 'teal';
}

function asBadge(row: BadgeDefinition): BadgeDefinition {
  return {
    ...row,
    coin_reward: Number(row.coin_reward ?? 0),
    threshold: Number(row.threshold ?? 0),
    tier: Number(row.tier ?? 1),
    sort_order: Number(row.sort_order ?? 0),
  };
}

export async function fetchBadgeCatalog(): Promise<BadgeDefinition[]> {
  const { data, error } = await supabase
    .from('badges')
    .select(BADGE_COLUMNS)
    .order('sort_order', { ascending: true });
  if (error) {
    if (isMissing(error.message)) {
      return [];
    }
    throw new Error(getErrorMessage(error));
  }
  return ((data ?? []) as BadgeDefinition[]).map(asBadge);
}

export async function fetchUserBadges(userId: string): Promise<UserBadge[]> {
  const { data, error } = await supabase
    .from('user_badges')
    .select(USER_BADGE_COLUMNS)
    .eq('user_id', userId)
    .order('earned_at', { ascending: false });
  if (error) {
    if (isMissing(error.message)) {
      return [];
    }
    throw new Error(getErrorMessage(error));
  }
  return ((data ?? []) as UserBadge[]).map((row) => ({
    ...row,
    coin_reward: Number(row.coin_reward ?? 0),
  }));
}

export async function fetchBadgeProgress(userId: string): Promise<BadgeWithProgress[]> {
  const [catalog, earned] = await Promise.all([fetchBadgeCatalog(), fetchUserBadges(userId)]);
  const byKey = new Map(earned.map((row) => [row.badge_key, row]));
  return catalog.map((badge) => {
    const mine = byKey.get(badge.key);
    return {
      ...badge,
      earned: Boolean(mine),
      earnedAt: mine?.earned_at ?? null,
      awardedCoins: Number(mine?.coin_reward ?? badge.coin_reward ?? 0),
    };
  });
}

export async function evaluateBadges(): Promise<NewBadge[]> {
  const { data, error } = await supabase.rpc('evaluate_badges');
  if (error) {
    console.warn('[blob:badges]', error.message);
    return [];
  }
  const list = (data as { newly_awarded?: unknown } | null)?.newly_awarded;
  if (!Array.isArray(list)) {
    return [];
  }
  return list.flatMap((row) => {
    if (!row || typeof row !== 'object') {
      return [];
    }
    const item = row as { key?: unknown; title?: unknown; coin_reward?: unknown };
    if (typeof item.key !== 'string' || !item.key) {
      return [];
    }
    return [
      {
        key: item.key,
        title: typeof item.title === 'string' && item.title ? item.title : item.key,
        coin_reward: Number(item.coin_reward ?? 0),
      },
    ];
  });
}

function isMissing(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes('does not exist') ||
    text.includes('could not find') ||
    text.includes('schema cache') ||
    text.includes('42p01')
  );
}
