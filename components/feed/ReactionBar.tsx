import { useRef, useState } from 'react';
import { Platform, Pressable, Vibration, View } from 'react-native';

import { Glyph, GLYPH, type GlyphId } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import {
  ReactionDismissScrim,
  ReactionPicker,
} from '@/components/feed/ReactionPicker';
import {
  displayReactionType,
  reactionEmoji,
  userReaction,
} from '@/lib/reactions';
import { THEME } from '@/lib/theme';
import type { Reaction, ReactionType } from '@/lib/types';
import { formatFeedTime } from '@/utils/format';

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
  const mineType = mine ? displayReactionType(mine.reaction_type) : null;
  const total = reactions?.length ?? 0;

  if (compact) {
    return (
      <View style={{ zIndex: trayOpen ? 42 : undefined }}>
        {trayOpen ? <ReactionDismissScrim onClose={() => setTrayOpen(false)} /> : null}
        {trayOpen ? (
          <View style={{ zIndex: 41, position: 'relative' }}>
            <ReactionPicker
              selected={mineType}
              align="end"
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
          emoji={reactionEmoji(mineType ?? 'like')}
          label="Like"
          count={total}
          color={THEME.textPrimary}
          dim={!mineType}
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
        <View style={{ zIndex: 41, position: 'relative' }}>
          <ReactionPicker
            selected={mineType}
            align="end"
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
          <AppText style={{ fontSize: 28, lineHeight: 32, opacity: mineType ? 1 : 0.45 }}>
            {reactionEmoji(mineType ?? 'like')}
          </AppText>
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
  emoji,
  label,
  count = 0,
  color,
  compact,
  dim,
  onPress,
  onLongPress,
}: {
  icon?: GlyphId;
  emoji?: string;
  label: string;
  count?: number;
  color: string;
  compact?: boolean;
  dim?: boolean;
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
          ? 'h-8 flex-row items-center rounded-full px-1'
          : 'h-7 flex-row items-center rounded-full px-1.5'
      }
      hitSlop={compact ? 4 : 6}
      style={onLongPress ? noSelectStyle : undefined}>
      {emoji ? (
        <AppText style={{ fontSize: compact ? 28 : 22, lineHeight: compact ? 32 : 26, opacity: dim ? 0.45 : 1 }}>
          {emoji}
        </AppText>
      ) : icon ? (
        <Glyph name={icon} color={color} size={compact ? 14 : 16} />
      ) : null}
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
