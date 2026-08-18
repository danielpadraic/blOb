import { useRef } from 'react';
import { Pressable, View } from 'react-native';

import { Glyph, GLYPH, type GlyphId } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';
import type { Reaction, ReactionType } from '@/lib/types';

const LIKE_ACTIVE = '#D24A5A';
const FIRE = '#E86A17';
const FIRE_ACTIVE = '#D4550A';

type ReactionBarProps = {
  reactions?: Reaction[];
  currentUserId?: string;
  commentCount?: number;
  compact?: boolean;
  onReact: (type: ReactionType) => void;
  onReply?: () => void;
  onShare?: (anchor: { x: number; y: number; width: number; height: number }) => void;
};

export function ReactionBar({
  reactions,
  currentUserId,
  commentCount = 0,
  compact = false,
  onReact,
  onReply,
  onShare,
}: ReactionBarProps) {
  const likeCount = reactions?.filter((reaction) => reaction.reaction_type === 'like').length ?? 0;
  const fireCount = reactions?.filter((reaction) => reaction.reaction_type === 'fire').length ?? 0;
  const liked = Boolean(
    reactions?.some(
      (reaction) => reaction.reaction_type === 'like' && reaction.user_id === currentUserId,
    ),
  );
  const fired = Boolean(
    reactions?.some(
      (reaction) => reaction.reaction_type === 'fire' && reaction.user_id === currentUserId,
    ),
  );

  return (
    <View className="flex-row items-center" style={{ columnGap: compact ? 2 : 4 }}>
      <Action
        compact={compact}
        icon={liked ? GLYPH.like : GLYPH.likeOutline}
        label="Like"
        count={likeCount}
        color={liked ? LIKE_ACTIVE : THEME.textMuted}
        onPress={() => onReact('like')}
      />
      <Action
        compact={compact}
        icon={GLYPH.fire}
        label="Fire"
        count={fireCount}
        color={fired ? FIRE_ACTIVE : FIRE}
        onPress={() => onReact('fire')}
      />
      {onReply ? (
        <Action
          compact={compact}
          icon={GLYPH.reply}
          label="Reply"
          count={commentCount}
          color={THEME.textMuted}
          onPress={onReply}
        />
      ) : null}
      {onShare ? (
        <View className="flex-1 items-end">
          <ShareAction compact={compact} onShare={onShare} />
        </View>
      ) : null}
    </View>
  );
}

function ShareAction({
  compact,
  onShare,
}: {
  compact?: boolean;
  onShare: (anchor: { x: number; y: number; width: number; height: number }) => void;
}) {
  const ref = useRef<View>(null);
  return (
    <Pressable
      ref={ref}
      collapsable={false}
      accessibilityRole="button"
      accessibilityLabel="Share"
      onPress={() => {
        ref.current?.measureInWindow((x, y, width, height) => {
          onShare({ x, y, width, height });
        });
      }}
      className={
        compact
          ? 'h-6 flex-row items-center rounded-full px-1'
          : 'h-7 flex-row items-center rounded-full px-1.5'
      }
      hitSlop={compact ? 4 : 6}>
      <Glyph name={GLYPH.share} color={THEME.textMuted} size={compact ? 14 : 16} />
    </Pressable>
  );
}

function Action({
  icon,
  label,
  count = 0,
  color,
  compact,
  onPress,
}: {
  icon: GlyphId;
  label: string;
  count?: number;
  color: string;
  compact?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `${label} ${count}` : label}
      onPress={onPress}
      className={
        compact
          ? 'h-6 flex-row items-center rounded-full px-1'
          : 'h-7 flex-row items-center rounded-full px-1.5'
      }
      hitSlop={compact ? 4 : 6}>
      <Glyph name={icon} color={color} size={compact ? 14 : 16} />
      {count > 0 ? (
        <AppText
          className={compact ? 'ml-0.5 text-[10px] font-bold' : 'ml-1 text-[12px] font-bold'}
          style={{ color }}>
          {count}
        </AppText>
      ) : null}
    </Pressable>
  );
}
