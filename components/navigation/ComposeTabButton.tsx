import type { ReactNode } from 'react';
import { Platform, Pressable, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';

type ComposeTabButtonProps = {
  onOpen: () => void;
  style?: StyleProp<ViewStyle>;
  onPress?: (event: GestureResponderEvent) => void;
  children?: ReactNode;
};

export function ComposeTabButton({ onOpen, style }: ComposeTabButtonProps) {
  return (
    <View style={[style, { alignItems: 'center', justifyContent: 'flex-start', overflow: 'visible' }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Quick actions"
        onPress={onOpen}
        className="items-center justify-start">
        <View
          className="items-center justify-center"
          style={{
            marginTop: -18,
            padding: 5,
            borderRadius: 24,
            backgroundColor: THEME.accentBright,
            ...(Platform.OS === 'web'
              ? { boxShadow: '0 8px 16px rgba(16, 19, 18, 0.22)' }
              : {
                  boxShadow: [
                    {
                      color: 'rgba(16, 19, 18, 0.22)',
                      offsetX: 0,
                      offsetY: 8,
                      blurRadius: 16,
                    },
                  ],
                }),
          }}>
          <View
            className="items-center justify-center"
            style={{
              width: 52,
              height: 52,
              borderRadius: 19,
              backgroundColor: THEME.primary,
            }}>
            <AppText
              className="font-bold"
              style={{
                color: THEME.primaryForeground,
                fontSize: 28,
                lineHeight: 30,
                marginTop: -2,
              }}>
              +
            </AppText>
          </View>
        </View>
      </Pressable>
    </View>
  );
}
