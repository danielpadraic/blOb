import { Platform, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { TourAnchor } from '@/components/tour/TourAnchor';
import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';

type ComposeTabButtonProps = {
  open: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

export function ComposeTabButton({ open, onPress, style }: ComposeTabButtonProps) {
  return (
    <View style={[style, { alignItems: 'center', justifyContent: 'flex-start', overflow: 'visible' }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Quick actions"
        accessibilityState={{ expanded: open }}
        onPress={onPress}
        hitSlop={4}
        className="items-center justify-start"
        style={{ minWidth: 44, minHeight: 44 }}>
        <TourAnchor id="tour-tab-create">
          <View
            className="items-center justify-center"
            style={{
              marginTop: -18,
              padding: 5,
              borderRadius: 24,
              backgroundColor: open ? THEME.accent : THEME.accentBright,
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
                  transform: [{ rotate: open ? '45deg' : '0deg' }],
                }}>
                +
              </AppText>
            </View>
          </View>
        </TourAnchor>
      </Pressable>
    </View>
  );
}
