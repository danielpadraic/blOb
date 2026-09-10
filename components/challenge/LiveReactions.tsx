import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Glyph, GLYPH } from '@/components/ui/Glyph';
import {
  ReactionDismissScrim,
  ReactionPicker,
  reactionNoSelectProps,
  reactionNoSelectStyle,
} from '@/components/feed/ReactionPicker';
import { ReactionMark } from '@/components/feed/ReactionMark';
import {
  REACTION_MARK_BUTTON,
  REACTION_MARK_HIT,
  userHasReactionType,
  userReactionTypes,
} from '@/lib/reactions';
import { THEME } from '@/lib/theme';
import type { Reaction, ReactionType } from '@/lib/types';

type LiveReactionsProps = {
  reactions?: Reaction[];
  currentUserId?: string;
  align?: 'start' | 'end';
  onReact: (type: ReactionType) => void;
  onReply?: () => void;
  onEdit?: () => void;
  onOverflow?: () => void;
};

export function LiveReactions({
  reactions,
  currentUserId,
  align = 'start',
  onReact,
  onReply,
  onEdit,
  onOverflow,
}: LiveReactionsProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const liked = userHasReactionType(reactions, currentUserId, 'like');
  const mineTypes = userReactionTypes(reactions, currentUserId);
  const justify = align === 'end' ? ('flex-end' as const) : ('flex-start' as const);

  return (
    <View style={{ position: 'relative', zIndex: pickerOpen ? 42 : 1, maxWidth: '100%' }}>
      {pickerOpen ? <ReactionDismissScrim onClose={() => setPickerOpen(false)} /> : null}
      {pickerOpen ? (
        <ReactionPicker selected={mineTypes} align={align} onPick={onReact} />
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: justify,
          gap: 4,
          minHeight: REACTION_MARK_HIT,
          maxWidth: '100%',
          zIndex: 41,
        }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Like"
          delayLongPress={280}
          onPress={() => {
            if (pickerOpen) {
              setPickerOpen(false);
              return;
            }
            onReact('like');
          }}
          onLongPress={() => setPickerOpen((open) => !open)}
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
        {onEdit ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Edit"
            onPress={onEdit}
            style={{ minHeight: 28, minWidth: 28, alignItems: 'center', justifyContent: 'center' }}>
            <Glyph name={GLYPH.pencil} color={THEME.textMuted} size={14} />
          </Pressable>
        ) : null}
        {onOverflow ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Comment menu"
            onPress={onOverflow}
            style={{ minHeight: 28, minWidth: 28, alignItems: 'center', justifyContent: 'center' }}>
            <Glyph name={GLYPH.more} color={THEME.textMuted} size={14} />
          </Pressable>
        ) : null}
        {onReply ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reply"
            onPress={onReply}
            style={{ minHeight: 28, minWidth: 28, alignItems: 'center', justifyContent: 'center' }}>
            <Glyph name={GLYPH.replyArrow} color={THEME.textMuted} size={16} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
