import { Pressable } from 'react-native';

import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { useOpenChallengeFromTag } from '@/hooks/useOpenChallengeFromTag';
import { THEME } from '@/lib/theme';

export function OriginChip({
  label,
  color,
  soft,
  glyph,
  onPress,
}: {
  label: string;
  color: string;
  soft: string;
  glyph: (typeof GLYPH)[keyof typeof GLYPH];
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 28,
        maxWidth: '100%',
        paddingHorizontal: 10,
        borderRadius: 999,
        backgroundColor: soft,
      }}>
      <Glyph name={glyph} color={color} size={12} />
      <AppText
        numberOfLines={1}
        ellipsizeMode="tail"
        className="text-[12px] font-semibold"
        style={{ color, flexShrink: 1, minWidth: 0 }}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function InChallengeChip({
  challengeId,
  title,
  titleOnly,
  visibility,
  challengeLane,
  isOfficial,
  createdBy,
  snapshot,
  postId,
  tab,
}: {
  challengeId: string;
  title?: string | null;
  titleOnly?: boolean;
  visibility?: string | null;
  challengeLane?: string | null;
  isOfficial?: boolean | null;
  createdBy?: string | null;
  snapshot?: {
    id?: string | null;
    title?: string | null;
    task?: string | null;
    tasks?: Array<{ title?: string | null } | string> | null;
    cover_image_url?: string | null;
    prize_pool?: number | null;
    buy_in_amount?: number | null;
    days_required?: number | null;
    target_count?: number | null;
    starts_at?: string | null;
    ends_at?: string | null;
    visibility?: string | null;
    challenge_lane?: unknown;
    is_official?: boolean | null;
    created_by?: string | null;
  } | null;
  postId?: string | null;
  tab?: 'overview' | 'board' | 'feed';
}) {
  const openTag = useOpenChallengeFromTag();
  const label = titleOnly
    ? title?.trim() || 'this challenge'
    : `in ${title?.trim() || 'this challenge'}`;
  return (
    <OriginChip
      label={label}
      color={THEME.accent}
      soft={THEME.accentSoft}
      glyph={GLYPH.flag}
      onPress={() =>
        void openTag({
          challengeId,
          visibility,
          challenge_lane: challengeLane,
          is_official: isOfficial,
          created_by: createdBy,
          postId,
          tab,
          snapshot: snapshot
            ? { ...snapshot, id: challengeId, title: snapshot.title ?? title }
            : {
                id: challengeId,
                title,
                visibility,
                challenge_lane: challengeLane,
                is_official: isOfficial,
                created_by: createdBy,
              },
        })
      }
    />
  );
}
