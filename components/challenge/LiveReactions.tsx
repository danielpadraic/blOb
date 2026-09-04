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
  const counts = liveReactionCounts(reactions, currentUserId);
  const mineTypes = new Set(counts.filter((row) => row.mine).map((row) => row.type));
  const justify = align === 'end' ? ('flex-end' as const) : ('flex-start' as const);

  return (
    <View style={{ position: 'relative', zIndex: pickerOpen ? 42 : 1, maxWidth: '100%' }}>
      {pickerOpen ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss reactions"
          onPress={() => setPickerOpen(false)}
          style={
            Platform.OS === 'web'
              ? ({
                  position: 'fixed',
                  top: 0,
                  right: 0,
                  bottom: 0,
                  left: 0,
                  backgroundColor: 'rgba(16, 19, 18, 0.28)',
                  zIndex: 40,
                } as object)
              : {
                  position: 'absolute',
                  top: -4000,
                  right: -400,
                  bottom: -4000,
                  left: -400,
                  backgroundColor: 'rgba(16, 19, 18, 0.28)',
                  zIndex: 40,
                }
          }
        />
      ) : null}
      {pickerOpen ? (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: '100%',
            marginBottom: 4,
            zIndex: 41,
            alignItems: justify,
          }}>
          <View
            className="flex-row items-center"
            style={{
              zIndex: 41,
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

      {/* Chips wrap. The controls group never gets evicted, so Reply stays tappable at 1 or 8 reactions. */}
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
        {counts.length > 0 ? (
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: justify,
              gap: 4,
              flexShrink: 1,
              minWidth: 0,
            }}>
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
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add a reaction"
            delayLongPress={280}
            onPress={() => setPickerOpen((open) => !open)}
            onLongPress={() => setPickerOpen((open) => !open)}
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
