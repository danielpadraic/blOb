import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, Vibration, View } from 'react-native';

import { Glyph, GLYPH, type GlyphId } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import {
  POST_REACTION_COLORS,
  POST_REACTION_TYPES,
  asReactionType,
  userReaction,
  type PostReactionType,
} from '@/lib/reactions';
import { THEME, themeShadow } from '@/lib/theme';
import type { Reaction, ReactionType } from '@/lib/types';
import { formatFeedTime } from '@/utils/format';

const REACTION_GLYPH: Record<PostReactionType, GlyphId> = {
  like: GLYPH.strong,
  love: GLYPH.like,
  care: GLYPH.care,
  fire: GLYPH.fire,
  sad: GLYPH.sad,
};

const noSelectStyle =
  Platform.OS === 'web'
    ? ({
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
      } as const)
    : undefined;

function clearWebSelection() {
  if (Platform.OS !== 'web') {
    return;
  }
  (
    globalThis as { getSelection?: () => { removeAllRanges?: () => void } | null }
  )
    .getSelection?.()
    ?.removeAllRanges?.();
}

function webNoSelectProps() {
  if (Platform.OS !== 'web') {
    return null;
  }
  return {
    onContextMenu: (event: { preventDefault: () => void }) => {
      event.preventDefault();
    },
    onMouseDown: (event: { preventDefault: () => void }) => {
      event.preventDefault();
    },
  };
}

function dismissScrimStyle() {
  if (Platform.OS === 'web') {
    return {
      position: 'fixed' as const,
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: 'rgba(16, 19, 18, 0.28)',
      zIndex: 40,
    };
  }
  return {
    position: 'absolute' as const,
    top: -4000,
    right: -400,
    bottom: -4000,
    left: -400,
    backgroundColor: 'rgba(16, 19, 18, 0.28)',
    zIndex: 40,
  };
}

function ReactionDismissScrim({ onClose }: { onClose: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Dismiss reactions"
      onPress={onClose}
      {...webNoSelectProps()}
      style={dismissScrimStyle()}
    />
  );
}

function openReactionTray(setOpen: (next: boolean) => void) {
  if (Platform.OS !== 'web') {
    Vibration.vibrate(10);
  }
  clearWebSelection();
  setOpen(true);
}

type ReactionBarProps = {
  reactions?: Reaction[];
  currentUserId?: string;
  commentCount?: number;
  compact?: boolean;
  createdAt?: string;
  onReact: (type: ReactionType) => void;
  onReply?: () => void;
  onShare?: (anchor: { x: number; y: number; width: number; height: number }) => void;
};

export function ReactionBar({
  reactions,
  currentUserId,
  commentCount = 0,
  compact = false,
  createdAt,
  onReact,
  onReply,
  onShare,
}: ReactionBarProps) {
  const [trayOpen, setTrayOpen] = useState(false);
  const mine = userReaction(reactions, currentUserId);
  const rawType = mine ? asReactionType(mine.reaction_type) : null;
  const mineType = rawType && rawType in REACTION_GLYPH ? (rawType as PostReactionType) : rawType ? 'like' : null;
  const total = reactions?.length ?? 0;

  if (compact) {
    return (
      <View style={{ zIndex: trayOpen ? 42 : undefined }}>
        {trayOpen ? <ReactionDismissScrim onClose={() => setTrayOpen(false)} /> : null}
        {trayOpen ? (
          <View style={{ zIndex: 41 }}>
          <ReactionTray
            selected={mineType}
            onPick={(type) => {
              setTrayOpen(false);
              onReact(type);
            }}
          />
          </View>
        ) : null}
      <View className="flex-row items-center" style={{ columnGap: 2, zIndex: 41 }}>
        <Action
          compact
          icon={mineType ? REACTION_GLYPH[mineType] : GLYPH.strongOutline}
          label="Like"
          count={total}
          color={mineType ? POST_REACTION_COLORS[mineType] : THEME.textMuted}
          onPress={() => {
            if (trayOpen) {
              setTrayOpen(false);
              return;
            }
            onReact('like');
          }}
          onLongPress={() => {
            if (trayOpen) {
              setTrayOpen(false);
              return;
            }
            openReactionTray(setTrayOpen);
          }}
        />
        {onReply ? (
          <Action
            compact
            icon={GLYPH.reply}
            label="Reply"
            count={commentCount}
            color={THEME.textMuted}
            onPress={onReply}
          />
        ) : null}
        {onShare ? (
          <View className="flex-1 items-end">
            <ShareAction compact onShare={onShare} />
          </View>
        ) : null}
      </View>
      </View>
    );
  }

  const commentLabel =
    commentCount === 1 ? '1 comment' : commentCount > 1 ? `${commentCount} comments` : 'Comment';

  return (
    <View style={{ zIndex: trayOpen ? 42 : undefined }}>
      {trayOpen ? <ReactionDismissScrim onClose={() => setTrayOpen(false)} /> : null}
      {trayOpen ? (
        <View style={{ zIndex: 41 }}>
        <ReactionTray
          selected={mineType}
          onPick={(type) => {
            setTrayOpen(false);
            onReact(type);
          }}
        />
        </View>
      ) : null}
      <View className="flex-row items-center justify-end" style={{ minHeight: 32, zIndex: 41 }}>
        {createdAt ? (
          <AppText className="flex-1 text-[11px]" style={{ color: THEME.textMuted }}>
            {footerTime(createdAt)}
          </AppText>
        ) : (
          <View className="flex-1" />
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={total > 0 ? `Like ${total}` : 'Like'}
          delayLongPress={280}
          hitSlop={8}
          onPress={() => {
            if (trayOpen) {
              setTrayOpen(false);
              return;
            }
            onReact('like');
          }}
          onLongPress={() => {
            if (trayOpen) {
              setTrayOpen(false);
              return;
            }
            openReactionTray(setTrayOpen);
          }}
          {...webNoSelectProps()}
          className="h-8 flex-row items-center px-1.5"
          style={noSelectStyle}>
          <Glyph
            name={mineType ? REACTION_GLYPH[mineType] : GLYPH.strongOutline}
            color={mineType ? POST_REACTION_COLORS[mineType] : THEME.textMuted}
            size={18}
          />
          {total > 0 ? (
            <AppText
              selectable={false}
              className="ml-1 text-[12px] font-semibold"
              style={[{ color: THEME.textPrimary }, noSelectStyle]}>
              {total}
            </AppText>
          ) : null}
        </Pressable>
        {onReply ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={commentLabel}
            hitSlop={8}
            onPress={onReply}
            className="h-8 flex-row items-center px-1.5">
            <Glyph name={GLYPH.reply} color={THEME.textMuted} size={16} />
            {commentCount > 0 ? (
              <AppText className="ml-1 text-[12px]" style={{ color: THEME.textMuted }}>
                {commentCount}
              </AppText>
            ) : null}
          </Pressable>
        ) : null}
        {onShare ? <ShareAction onShare={onShare} /> : null}
      </View>
    </View>
  );
}

function footerTime(date: string): string {
  const short = formatFeedTime(date);
  if (/^\d+[hm]$/.test(short)) {
    return `${short} ago`;
  }
  return short;
}

function ReactionTray({
  selected,
  onPick,
}: {
  selected: PostReactionType | null;
  onPick: (type: PostReactionType) => void;
}) {
  const scale = useRef(new Animated.Value(0.86)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 7, tension: 120, useNativeDriver: true }).start();
  }, [scale]);

  return (
    <Animated.View
      style={{
        transform: [{ scale }],
        alignSelf: 'flex-end',
        marginBottom: 8,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: THEME.surface,
        borderWidth: 1,
        borderColor: THEME.border,
        borderRadius: 22,
        paddingHorizontal: 6,
        paddingVertical: 4,
        ...themeShadow('card'),
      }}>
      {POST_REACTION_TYPES.map((type) => {
        const active = selected === type;
        return (
          <Pressable
            key={type}
            accessibilityRole="button"
            accessibilityLabel={type}
            onPress={() => onPick(type)}
            {...(Platform.OS === 'web'
              ? {
                  onMouseDown: (event: { preventDefault: () => void }) => {
                    event.preventDefault();
                  },
                }
              : null)}
            style={{
              minHeight: 40,
              minWidth: 40,
              paddingHorizontal: 8,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: active ? THEME.accentSoft : 'transparent',
            }}>
            <Glyph name={REACTION_GLYPH[type]} color={POST_REACTION_COLORS[type]} size={20} />
          </Pressable>
        );
      })}
    </Animated.View>
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
  onLongPress,
}: {
  icon: GlyphId;
  label: string;
  count?: number;
  color: string;
  compact?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `${label} ${count}` : label}
      delayLongPress={onLongPress ? 280 : undefined}
      onPress={onPress}
      onLongPress={onLongPress}
      {...(onLongPress ? webNoSelectProps() : null)}
      className={
        compact
          ? 'h-6 flex-row items-center rounded-full px-1'
          : 'h-7 flex-row items-center rounded-full px-1.5'
      }
      hitSlop={compact ? 4 : 6}
      style={onLongPress ? noSelectStyle : undefined}>
      <Glyph name={icon} color={color} size={compact ? 14 : 16} />
      {count > 0 ? (
        <AppText
          selectable={false}
          className={compact ? 'ml-0.5 text-[10px] font-bold' : 'ml-1 text-[12px] font-bold'}
          style={[{ color }, onLongPress ? noSelectStyle : null]}>
          {count}
        </AppText>
      ) : null}
    </Pressable>
  );
}
