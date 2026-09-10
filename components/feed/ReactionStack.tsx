import { Pressable, View } from 'react-native';

import { ReactionMark } from '@/components/feed/ReactionMark';
import { reactionNoSelectProps, reactionNoSelectStyle } from '@/components/feed/ReactionPicker';
import { AppText } from '@/components/ui/AppText';
import {
  cornerReactionChips,
  REACTION_MARK_CORNER,
} from '@/lib/reactions';
import { THEME } from '@/lib/theme';
import type { Reaction, ReactionType } from '@/lib/types';

type ReactionStackProps = {
  reactions?: Reaction[];
  currentUserId?: string;
  corner: 'start' | 'end';
  onToggle: (type: ReactionType) => void;
};

/** Corner counts. Not the Like button. */
export function ReactionStack({
  reactions,
  currentUserId,
  corner,
  onToggle,
}: ReactionStackProps) {
  const shown = cornerReactionChips(reactions, currentUserId);
  if (shown.length === 0) {
    return null;
  }
  return (
    <View
      pointerEvents="box-none"
      style={[
        {
          position: 'absolute',
          bottom: 4,
          left: corner === 'start' ? 4 : undefined,
          right: corner === 'end' ? 4 : undefined,
          flexDirection: 'row',
          flexWrap: 'nowrap',
          alignItems: 'center',
          gap: 2,
          zIndex: 6,
          maxWidth: '92%',
        },
        reactionNoSelectStyle,
      ]}>
      {shown.map((row) => (
        <Pressable
          key={row.type}
          accessibilityRole="button"
          accessibilityLabel={`${row.type}${row.count > 1 ? ` ${row.count}` : ''}`}
          onPress={() => onToggle(row.type as ReactionType)}
          {...reactionNoSelectProps()}
          style={{
            minHeight: 28,
            minWidth: REACTION_MARK_CORNER + (row.count > 1 ? 14 : 0),
            paddingHorizontal: 2,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1,
            borderRadius: 999,
            backgroundColor: row.mine ? THEME.accentSoft : 'transparent',
          }}>
          <ReactionMark type={row.type} size={REACTION_MARK_CORNER} />
          {row.count > 1 ? (
            <AppText
              selectable={false}
              style={{
                fontSize: 10,
                fontWeight: '700',
                color: THEME.textPrimary,
                fontVariant: ['tabular-nums'],
              }}>
              {row.count}
            </AppText>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}
