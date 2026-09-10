import { Pressable, View } from 'react-native';

import { ReactionMark } from '@/components/feed/ReactionMark';
import { reactionNoSelectProps, reactionNoSelectStyle } from '@/components/feed/ReactionPicker';
import { AppText } from '@/components/ui/AppText';
import {
  LIVE_PILL_GAP,
  LIVE_PILL_HEIGHT,
  LIVE_PILL_MARK,
  LIVE_PILL_MARK_MINE,
  LIVE_PILL_OVERLAP,
  LIVE_PILL_PAD_X,
  liveReactionPill,
  reactionPickerLabel,
} from '@/lib/reactions';
import { THEME } from '@/lib/theme';
import type { Reaction, ReactionType } from '@/lib/types';

type LiveReactionChipProps = {
  reactions?: Reaction[];
  currentUserId?: string;
  /** Own / right bubbles sit on the right edge. Others on the left. */
  corner: 'start' | 'end';
  onPhoto?: boolean;
  onOpenWho: (type: ReactionType) => void;
};

/** WhatsApp-style capsule. Tap opens who-reacted. Never toggles. */
export function LiveReactionChip({
  reactions,
  currentUserId,
  corner,
  onPhoto,
  onOpenWho,
}: LiveReactionChipProps) {
  const pill = liveReactionPill(reactions, currentUserId);
  if (pill.types.length === 0) {
    return null;
  }
  const first = pill.types[0]?.type as ReactionType;
  const label = pill.types.map((row) => reactionPickerLabel(row.type)).join(', ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Who reacted. ${label}`}
      onPress={() => onOpenWho(first)}
      {...reactionNoSelectProps()}
      style={[
        {
          position: 'absolute',
          bottom: -LIVE_PILL_OVERLAP,
          left: corner === 'start' ? 8 : undefined,
          right: corner === 'end' ? 8 : undefined,
          minHeight: LIVE_PILL_HEIGHT,
          height: LIVE_PILL_HEIGHT,
          paddingHorizontal: LIVE_PILL_PAD_X,
          flexDirection: 'row',
          alignItems: 'center',
          gap: LIVE_PILL_GAP,
          borderRadius: 999,
          backgroundColor: onPhoto ? 'rgba(16, 19, 18, 0.80)' : 'rgba(16, 19, 18, 0.88)',
          borderWidth: 1,
          borderColor: 'rgba(255, 255, 255, 0.18)',
          zIndex: 6,
        },
        reactionNoSelectStyle,
      ]}>
      {pill.types.map((row) => (
        <View
          key={row.type}
          style={{
            width: LIVE_PILL_MARK_MINE,
            height: LIVE_PILL_MARK_MINE,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: row.mine ? 1 : 0.82,
            transform: [{ scale: row.mine ? 1.08 : 1 }],
          }}>
          <ReactionMark type={row.type} size={row.mine ? LIVE_PILL_MARK_MINE : LIVE_PILL_MARK} />
        </View>
      ))}
      {pill.reactorCount > 1 ? (
        <AppText
          selectable={false}
          style={{
            marginLeft: 2,
            fontSize: 12,
            fontWeight: '700',
            color: THEME.primaryForeground,
            fontVariant: ['tabular-nums'],
          }}>
          {pill.reactorCount}
        </AppText>
      ) : null}
    </Pressable>
  );
}
