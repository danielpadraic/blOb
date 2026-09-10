import { Platform, Pressable, View } from 'react-native';

import { ReactionMark } from '@/components/feed/ReactionMark';
import {
  PICKER_REACTION_TYPES,
  REACTION_MARK_HIT,
  REACTION_MARK_PICKER,
  reactionPickerLabel,
  type PickerReactionType,
} from '@/lib/reactions';
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

/** Vertical, transparent. Bob PNG only. Does not shove the bubble. */
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
      <View style={{ gap: 2 }}>
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
                width: REACTION_MARK_HIT,
                height: REACTION_MARK_HIT,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'transparent',
                opacity: active ? 1 : 0.92,
              }}>
              <ReactionMark type={type} size={REACTION_MARK_PICKER} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
