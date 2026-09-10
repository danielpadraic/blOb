import { Platform, Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import {
  PICKER_REACTION_TYPES,
  reactionEmoji,
  reactionPickerLabel,
  type PickerReactionType,
} from '@/lib/reactions';
import { THEME } from '@/lib/theme';
import type { ReactionType } from '@/lib/types';

export function keepReactionFocusProps() {
  if (Platform.OS !== 'web') {
    return null;
  }
  return {
    onMouseDown: (event: { preventDefault: () => void }) => {
      event.preventDefault();
    },
  };
}

export function ReactionDismissScrim({ onClose }: { onClose: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Dismiss reactions"
      onPress={onClose}
      {...keepReactionFocusProps()}
      style={
        Platform.OS === 'web'
          ? ({
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              left: 0,
              backgroundColor: 'transparent',
              zIndex: 40,
            } as object)
          : {
              position: 'absolute',
              top: -4000,
              right: -400,
              bottom: -4000,
              left: -400,
              backgroundColor: 'transparent',
              zIndex: 40,
            }
      }
    />
  );
}

type ReactionPickerProps = {
  selected?: string | null;
  align?: 'start' | 'end';
  onPick: (type: ReactionType) => void;
};

/** Vertical, transparent. Emoji only. Does not shove the bubble. */
export function ReactionPicker({ selected, align = 'start', onPick }: ReactionPickerProps) {
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: align === 'end' ? undefined : 0,
        right: align === 'end' ? 0 : undefined,
        bottom: '100%',
        marginBottom: 6,
        zIndex: 41,
        alignItems: align === 'end' ? 'flex-end' : 'flex-start',
      }}>
      <View style={{ gap: 4 }}>
        {PICKER_REACTION_TYPES.map((type: PickerReactionType) => {
          const active = selected === type;
          return (
            <Pressable
              key={type}
              accessibilityRole="button"
              accessibilityLabel={reactionPickerLabel(type)}
              onPress={() => onPick(type)}
              {...keepReactionFocusProps()}
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: active ? THEME.accentSoft : 'transparent',
              }}>
              <AppText style={{ fontSize: 30, lineHeight: 34 }}>{reactionEmoji(type)}</AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
