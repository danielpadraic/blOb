import { Pressable, View } from 'react-native';

import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { THEME, themeShadow } from '@/lib/theme';

type PostOverflowMenuProps = {
  visible: boolean;
  onClose: () => void;
  onReport: () => void;
  onCopyLink: () => void;
};

export function PostOverflowMenu({
  visible,
  onClose,
  onReport,
  onCopyLink,
}: PostOverflowMenuProps) {
  return (
    <ChromeOverlay visible={visible} onClose={onClose} align="start" dim>
      <View className="items-end px-4 pt-3">
        <View
          style={{
            width: 168,
            backgroundColor: THEME.surface,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: THEME.border,
            overflow: 'hidden',
            ...themeShadow('card'),
          }}>
          <MenuRow label="Copy link" onPress={onCopyLink} />
          <View style={{ height: 1, backgroundColor: THEME.border }} />
          <MenuRow label="Report" onPress={onReport} />
        </View>
      </View>
    </ChromeOverlay>
  );
}

function MenuRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="px-3 py-2.5">
      <AppText className="text-[13px] font-semibold text-charcoal">{label}</AppText>
    </Pressable>
  );
}
