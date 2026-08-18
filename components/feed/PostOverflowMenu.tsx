import { Modal, Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';

type PostOverflowMenuProps = {
  visible: boolean;
  isOwn: boolean;
  onClose: () => void;
  onReport: () => void;
  onCopyLink: () => void;
  onDelete?: () => void;
};

export function PostOverflowMenu({
  visible,
  isOwn,
  onClose,
  onReport,
  onCopyLink,
  onDelete,
}: PostOverflowMenuProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end bg-charcoal/70" onPress={onClose}>
        <Pressable
          className="px-4 pb-10 pt-3"
          style={{
            backgroundColor: THEME.background,
            borderTopLeftRadius: THEME.radiusLg,
            borderTopRightRadius: THEME.radiusLg,
          }}
          onPress={(event) => event.stopPropagation()}>
          <View
            className="mb-4 self-center rounded-full"
            style={{ width: 36, height: 4, backgroundColor: THEME.border }}
          />
          <View className="gap-2">
            <MenuRow label="Copy link" onPress={onCopyLink} />
            <MenuRow label="Report" onPress={onReport} />
            {isOwn && onDelete ? (
              <MenuRow label="Delete" destructive onPress={onDelete} />
            ) : null}
            <MenuRow label="Cancel" muted onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MenuRow({
  label,
  onPress,
  destructive,
  muted,
}: {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  muted?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="rounded-blob px-3 py-3"
      style={{ backgroundColor: THEME.surface }}>
      <AppText
        className="text-center text-[15px] font-semibold"
        style={{
          color: destructive ? THEME.danger : muted ? THEME.textMuted : THEME.textPrimary,
        }}>
        {label}
      </AppText>
    </Pressable>
  );
}
