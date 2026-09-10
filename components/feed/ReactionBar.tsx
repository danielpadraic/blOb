import { useRef, useState } from 'react';
import { Platform, Pressable, Vibration, View } from 'react-native';

import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { ReactionMark } from '@/components/feed/ReactionMark';
import {
  ReactionDismissScrim,
  ReactionPicker,
  reactionNoSelectProps,
  reactionNoSelectStyle,
} from '@/components/feed/ReactionPicker';
import {
  REACTION_MARK_BUTTON,
  REACTION_MARK_HIT,
  userHasReactionType,
  userReactionTypes,
} from '@/lib/reactions';
import { THEME } from '@/lib/theme';
import type { Reaction, ReactionType } from '@/lib/types';
import { formatFeedTime } from '@/utils/format';

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
  const liked = userHasReactionType(reactions, currentUserId, 'like');
  const mineTypes = userReactionTypes(reactions, currentUserId);
  const commentLabel =
    commentCount === 1 ? '1 comment' : commentCount > 1 ? `${commentCount} comments` : 'Comment';

  return (
    <View style={{ zIndex: trayOpen ? 42 : undefined, position: 'relative' }}>
      {trayOpen ? <ReactionDismissScrim onClose={() => setTrayOpen(false)} /> : null}
      {trayOpen ? (
        <View style={{ zIndex: 41, position: 'relative' }}>
          <ReactionPicker selected={mineTypes} align="end" onPick={onReact} />
        </View>
      ) : null}
      <View
        className="flex-row items-center"
        style={{
          minHeight: REACTION_MARK_HIT,
          justifyContent: compact ? 'flex-start' : 'flex-end',
          zIndex: 41,
        }}>
        {compact ? null : createdAt ? (
          <AppText className="flex-1 text-[11px]" style={{ color: THEME.textMuted }}>
            {footerTime(createdAt)}
          </AppText>
        ) : (
          <View className="flex-1" />
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Like"
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
          {...reactionNoSelectProps()}
          style={[
            {
              minHeight: REACTION_MARK_HIT,
              minWidth: REACTION_MARK_HIT,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 999,
              backgroundColor: liked ? THEME.accentSoft : 'transparent',
              transform: [{ scale: liked ? 1.06 : 1 }],
            },
            reactionNoSelectStyle,
          ]}>
          <ReactionMark type="like" size={REACTION_MARK_BUTTON} />
        </Pressable>
        {onReply ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={commentLabel}
            hitSlop={8}
            onPress={onReply}
            className="h-8 flex-row items-center px-1.5">
            <Glyph name={GLYPH.reply} color={THEME.textMuted} size={compact ? 14 : 16} />
            {commentCount > 0 ? (
              <AppText className="ml-1 text-[12px]" style={{ color: THEME.textMuted }}>
                {commentCount}
              </AppText>
            ) : null}
          </Pressable>
        ) : null}
        {onShare ? <ShareAction compact={compact} onShare={onShare} /> : null}
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
