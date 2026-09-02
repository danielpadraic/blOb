import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';

import { Glyph, GLYPH, type GlyphId } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { liveReactionCounts } from '@/lib/liveThread';
import { POST_REACTION_COLORS, POST_REACTION_TYPES, type PostReactionType } from '@/lib/reactions';
import { THEME, themeShadow } from '@/lib/theme';
import type { Reaction, ReactionType } from '@/lib/types';

const LIVE_REACTION_GLYPH: Record<PostReactionType, GlyphId> = {
  like: GLYPH.strong,
  love: GLYPH.like,
  care: GLYPH.care,
  fire: GLYPH.fire,
  sad: GLYPH.sad,
};

type LiveReactionsProps = {
  reactions?: Reaction[];
  currentUserId?: string;
  onReact: (type: ReactionType) => void;
  onReply?: () => void;
  onEdit?: () => void;
};

export function LiveReactions({ reactions, currentUserId, onReact, onReply, onEdit }: LiveReactionsProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const counts = liveReactionCounts(reactions, currentUserId);
  const mineTypes = new Set(counts.filter((row) => row.mine).map((row) => row.type));

  return (
    <View style={{ position: 'relative', zIndex: pickerOpen ? 8 : 1 }}>
      {pickerOpen ? (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: '100%',
            marginBottom: 4,
            zIndex: 20,
            alignItems: 'flex-start',
          }}>
          <View
            className="flex-row items-center"
            style={{
              backgroundColor: THEME.surface,
              borderWidth: 1,
              borderColor: THEME.border,
              borderRadius: 22,
              paddingHorizontal: 4,
              paddingVertical: 2,
              ...themeShadow('card'),
            }}>
            {POST_REACTION_TYPES.map((type) => {
              const active = mineTypes.has(type);
              return (
                <Pressable
                  key={type}
                  accessibilityRole="button"
                  accessibilityLabel={type}
                  onPress={() => {
                    setPickerOpen(false);
                    onReact(type);
                  }}
                  {...keepFocusProps()}
                  style={{
                    minHeight: 36,
                    minWidth: 36,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 999,
                    backgroundColor: active ? THEME.accentSoft : 'transparent',
                  }}>
                  <Glyph name={LIVE_REACTION_GLYPH[type]} color={POST_REACTION_COLORS[type]} size={18} />
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <View className="flex-row flex-wrap items-center" style={{ gap: 4, minHeight: 28 }}>
        {counts.map((row) => (
          <Pressable
            key={row.type}
            accessibilityRole="button"
            accessibilityLabel={`${row.type} ${row.count}`}
            delayLongPress={280}
            onPress={() => onReact(row.type)}
            onLongPress={() => setPickerOpen((open) => !open)}
            {...keepFocusProps()}
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
            <Glyph name={LIVE_REACTION_GLYPH[row.type]} color={POST_REACTION_COLORS[row.type]} size={13} />
            <AppText className="text-[11px] font-semibold" style={{ color: THEME.textPrimary }}>
              {row.count}
            </AppText>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a reaction"
          delayLongPress={280}
          onPress={() => setPickerOpen((open) => !open)}
          onLongPress={() => setPickerOpen(true)}
          {...keepFocusProps()}
          style={{ minHeight: 28, minWidth: 28, alignItems: 'center', justifyContent: 'center' }}>
          <Glyph name={GLYPH.plus} color={THEME.textMuted} size={14} />
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
  );
}

function keepFocusProps() {
  if (Platform.OS !== 'web') {
    return null;
  }
  return {
    onMouseDown: (event: { preventDefault: () => void }) => {
      event.preventDefault();
    },
  };
}
