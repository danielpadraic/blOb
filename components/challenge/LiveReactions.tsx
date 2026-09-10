import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import {
  ReactionDismissScrim,
  ReactionPicker,
  keepReactionFocusProps,
  reactionGlyph,
} from '@/components/feed/ReactionPicker';
import { compactReactionChips, displayReactionType, POST_REACTION_COLORS, userReaction } from '@/lib/reactions';
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
  const mine = userReaction(reactions, currentUserId);
  const mineType = mine ? displayReactionType(mine.reaction_type) : null;
  const { shown, overflow } = compactReactionChips(reactions, currentUserId);
  const justify = align === 'end' ? ('flex-end' as const) : ('flex-start' as const);

  function pick(type: ReactionType) {
    setPickerOpen(false);
    onReact(type);
  }

  return (
    <View style={{ position: 'relative', zIndex: pickerOpen ? 42 : 1, maxWidth: '100%' }}>
      {pickerOpen ? <ReactionDismissScrim onClose={() => setPickerOpen(false)} /> : null}
      {pickerOpen ? (
        <ReactionPicker selected={mineType} align={align} onPick={pick} />
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: justify,
          gap: 4,
          minHeight: 28,
          maxWidth: '100%',
          zIndex: 41,
        }}>
        {shown.map((row) => (
          <Pressable
            key={row.type}
            accessibilityRole="button"
            accessibilityLabel={`${row.type} ${row.count}`}
            delayLongPress={280}
            onPress={() => onReact((row.type === 'laugh' ? 'laugh' : row.type) as ReactionType)}
            onLongPress={() => setPickerOpen((open) => !open)}
            {...keepReactionFocusProps()}
            style={{
              minHeight: 26,
              paddingHorizontal: 8,
              borderRadius: 999,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              backgroundColor: row.mine ? THEME.accentSoft : THEME.surface,
              borderWidth: 1,
              borderColor: row.mine ? THEME.accent : THEME.border,
            }}>
            <Glyph name={reactionGlyph(row.type)} color={POST_REACTION_COLORS[row.type] ?? THEME.accent} size={13} />
            <AppText className="text-[11px] font-semibold" style={{ color: THEME.textPrimary }}>
              {row.count}
            </AppText>
          </Pressable>
        ))}
        {overflow > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More reactions"
            onPress={() => setPickerOpen((open) => !open)}
            {...keepReactionFocusProps()}
            style={{ minHeight: 26, paddingHorizontal: 8, justifyContent: 'center' }}>
            <AppText className="text-[13px] font-semibold" style={{ color: THEME.textMuted }}>
              ···
            </AppText>
          </Pressable>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a reaction"
            delayLongPress={280}
            onPress={() => {
              if (pickerOpen) {
                setPickerOpen(false);
                return;
              }
              onReact('like');
            }}
            onLongPress={() => setPickerOpen((open) => !open)}
            {...keepReactionFocusProps()}
            style={{ minHeight: 28, minWidth: 28, alignItems: 'center', justifyContent: 'center' }}>
            <Glyph
              name={mineType ? reactionGlyph(mineType) : GLYPH.strongOutline}
              color={mineType ? POST_REACTION_COLORS[mineType] ?? THEME.accent : THEME.textMuted}
              size={14}
            />
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
              <Glyph name={GLYPH.replyArrow} color={THEME.textMuted} size={14} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}
