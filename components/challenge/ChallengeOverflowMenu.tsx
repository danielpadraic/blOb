import { useRef, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { copy } from '@/lib/copy';
import { THEME, themeShadow } from '@/lib/theme';

export type MenuAnchor = { x: number; y: number; width: number; height: number };

export function ChallengeOverflowButton({
  onPress,
}: {
  onPress: (anchor: MenuAnchor) => void;
}) {
  const ref = useRef<View>(null);

  return (
    <Pressable
      ref={ref}
      collapsable={false}
      accessibilityRole="button"
      accessibilityLabel="Challenge menu"
      hitSlop={8}
      onPress={() => {
        ref.current?.measureInWindow((x, y, width, height) => {
          onPress({ x, y, width, height });
        });
      }}
      style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
      <Glyph name={GLYPH.more} color={THEME.textPrimary} size={18} />
    </Pressable>
  );
}

export function ChallengeMenuPopover({
  anchor,
  onClose,
  onCancelPress,
}: {
  anchor: MenuAnchor | null;
  onClose: () => void;
  onCancelPress: () => void;
}) {
  const hostRef = useRef<View>(null);
  const [host, setHost] = useState<MenuAnchor | null>(null);

  if (!anchor) {
    return null;
  }

  function measureHost() {
    hostRef.current?.measureInWindow((x, y, width, height) => {
      setHost({ x, y, width, height });
    });
  }

  const windowSize = Dimensions.get('window');
  const hostX = host?.x ?? 0;
  const hostY = host?.y ?? 0;
  const hostW = host?.width || windowSize.width;
  const hostH = host?.height || windowSize.height;
  const popW = 188;
  const popH = 52;
  const gap = 6;
  const localX = anchor.x - hostX;
  const localY = anchor.y - hostY;
  let top = localY + anchor.height + gap;
  if (top + popH > hostH - 8) {
    const above = localY - gap - popH;
    top = above >= 8 ? above : Math.max(8, hostH - popH - 8);
  }
  let left = localX + anchor.width - popW;
  left = Math.min(Math.max(8, left), Math.max(8, hostW - popW - 8));

  return (
    <View
      ref={hostRef}
      pointerEvents="box-none"
      collapsable={false}
      onLayout={measureHost}
      style={styles.host}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        onPress={onClose}
        style={styles.dismiss}
      />
      <View
        pointerEvents="auto"
        style={[
          styles.popover,
          {
            top,
            left,
            width: popW,
            backgroundColor: THEME.surface,
            borderColor: THEME.border,
            ...themeShadow('card'),
          },
        ]}>
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            onClose();
            onCancelPress();
          }}
          className="justify-center px-3"
          style={{ minHeight: 44 }}>
          <AppText className="text-[14px] font-semibold" style={{ color: THEME.danger }}>
            {copy('challenge.cancel')}
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 50,
    elevation: 50,
  },
  dismiss: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'transparent',
  },
  popover: {
    position: 'absolute',
    zIndex: 51,
    elevation: 51,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
});
