import { useRef } from 'react';
import { Pressable, View } from 'react-native';

import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { reactionNoSelectProps, reactionNoSelectStyle } from '@/components/feed/ReactionPicker';
import {
  REACTION_MARK_HIT,
  reactionChipFill,
  reactionColor,
  userHasReactionType,
} from '@/lib/reactions';
import { THEME } from '@/lib/theme';
import type { Reaction, ReactionType } from '@/lib/types';

export type LiveReactionAnchor = { x: number; y: number; width: number; height: number };

type LiveReactionsProps = {
  reactions?: Reaction[];
  currentUserId?: string;
  align?: 'start' | 'end';
  pickerOpen: boolean;
  onPickerOpen: (anchor: LiveReactionAnchor) => void;
  onPickerClose: () => void;
  onReact: (type: ReactionType) => void;
  onReply?: () => void;
  onEdit?: () => void;
  onOverflow?: () => void;
};

export function LiveReactions({
  reactions,
  currentUserId,
  align = 'start',
  pickerOpen,
  onPickerOpen,
  onPickerClose,
  onReact,
  onReply,
  onEdit,
  onOverflow,
}: LiveReactionsProps) {
  const liked = userHasReactionType(reactions, currentUserId, 'like');
  const justify = align === 'end' ? ('flex-end' as const) : ('flex-start' as const);
  const thumbRef = useRef<View>(null);

  function openTray() {
    thumbRef.current?.measureInWindow((x, y, width, height) => {
      onPickerOpen({ x, y, width, height });
    });
  }

  return (
    <View style={{ maxWidth: '100%' }}>
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: justify,
          gap: 4,
          minHeight: REACTION_MARK_HIT,
          maxWidth: '100%',
        }}>
        <View ref={thumbRef} collapsable={false}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Like"
            delayLongPress={280}
            onPress={() => {
              if (pickerOpen) {
                onPickerClose();
                return;
              }
              onReact('like');
            }}
            onLongPress={openTray}
            {...reactionNoSelectProps()}
            style={[
              {
                minHeight: REACTION_MARK_HIT,
                minWidth: REACTION_MARK_HIT,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 999,
                ...reactionChipFill('like', liked),
                transform: [{ scale: liked ? 1.06 : 1 }],
              },
              reactionNoSelectStyle,
            ]}>
            <Glyph
              name={liked ? GLYPH.strong : GLYPH.strongOutline}
              color={reactionColor('like')}
              size={20}
            />
          </Pressable>
        </View>
        {onEdit ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit"
            onPress={() => {
              onPickerClose();
              onEdit();
            }}
            style={{ minHeight: 28, minWidth: 28, alignItems: 'center', justifyContent: 'center' }}>
            <Glyph name={GLYPH.pencil} color={THEME.textMuted} size={14} />
          </Pressable>
        ) : null}
        {onOverflow ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Comment menu"
            onPress={() => {
              onPickerClose();
              onOverflow();
            }}
            style={{ minHeight: 28, minWidth: 28, alignItems: 'center', justifyContent: 'center' }}>
            <Glyph name={GLYPH.more} color={THEME.textMuted} size={14} />
          </Pressable>
        ) : null}
        {onReply ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reply"
            onPress={() => {
              onPickerClose();
              onReply();
            }}
            style={{ minHeight: 28, minWidth: 28, alignItems: 'center', justifyContent: 'center' }}>
            <Glyph name={GLYPH.replyArrow} color={THEME.textMuted} size={16} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
