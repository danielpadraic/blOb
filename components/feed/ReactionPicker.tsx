import { Platform, Pressable, View } from 'react-native';

import { ReactionMark } from '@/components/feed/ReactionMark';
import {
  PICKER_REACTION_TYPES,
  REACTION_MARK_HIT,
  REACTION_MARK_PICKER,
  reactionPickerLabel,
  type PickerReactionType,
} from '@/lib/reactions';
import { THEME } from '@/lib/theme';
import type { ReactionType } from '@/lib/types';

export const reactionNoSelectStyle =
  Platform.OS === 'web'
    ? ({
        userSelect: 'none',
        WebkitUserSelect: 'none',
        MozUserSelect: 'none',
        WebkitTouchCallout: 'none',
        cursor: 'pointer',
      } as const)
    : undefined;

export function reactionNoSelectProps() {
  if (Platform.OS !== 'web') {
    return null;
  }
  return {
    onContextMenu: (event: { preventDefault: () => void }) => {
      event.preventDefault();
    },
    onMouseDown: (event: { preventDefault: () => void }) => {
      event.preventDefault();
    },
  };
}

export function keepReactionFocusProps() {
  return reactionNoSelectProps();
}

export function ReactionDismissScrim({ onClose }: { onClose: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Dismiss reactions"
      onPress={onClose}
      {...reactionNoSelectProps()}
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
  selected?: readonly string[] | string | null;
  align?: 'start' | 'end';
  onPick: (type: ReactionType) => void;
};

/** Vertical, transparent. Stay-open. Bob PNG only. */
export function ReactionPicker({ selected, align = 'start', onPick }: ReactionPickerProps) {
  const active = new Set(
    (Array.isArray(selected) ? selected : selected ? [selected] : []).map((type) => String(type)),
  );
  return (
    <View
      pointerEvents="box-none"
      style={[
        {
          position: 'absolute',
          left: align === 'end' ? undefined : 0,
          right: align === 'end' ? 0 : undefined,
          bottom: '100%',
          marginBottom: 6,
          zIndex: 41,
          alignItems: align === 'end' ? 'flex-end' : 'flex-start',
        },
        reactionNoSelectStyle,
      ]}>
      <View style={{ gap: 2 }}>
        {PICKER_REACTION_TYPES.map((type: PickerReactionType) => {
          const on = active.has(type);
          return (
            <Pressable
              key={type}
              accessibilityRole="button"
              accessibilityLabel={reactionPickerLabel(type)}
              onPress={() => onPick(type)}
              {...reactionNoSelectProps()}
              style={{
                width: REACTION_MARK_HIT,
                height: REACTION_MARK_HIT,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: on ? THEME.accentSoft : 'transparent',
                borderRadius: 999,
              }}>
              <ReactionMark type={type} size={REACTION_MARK_PICKER} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
