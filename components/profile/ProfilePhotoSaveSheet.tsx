import { Pressable, View } from 'react-native';

import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { THEME, themeShadow } from '@/lib/theme';
import type { PostAudience } from '@/lib/postAudience';

type ProfilePhotoSaveSheetProps = {
  visible: boolean;
  kind: 'avatar' | 'cover';
  onClose: () => void;
  onSave: (audience: Extract<PostAudience, 'public' | 'friends'>) => void;
};

export function ProfilePhotoSaveSheet({ visible, kind, onClose, onSave }: ProfilePhotoSaveSheetProps) {
  return (
    <ChromeOverlay visible={visible} onClose={onClose} align="end">
      <View
        className="px-5 pt-3"
        style={{
          backgroundColor: THEME.surface,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          paddingBottom: 28,
          ...themeShadow('card'),
        }}>
        <View className="items-center pb-3">
          <View className="h-1 w-10 rounded-full" style={{ backgroundColor: THEME.border }} />
        </View>
        <AppText className="text-[17px] font-extrabold text-charcoal">
          {kind === 'cover' ? 'Share your cover' : 'Share your photo'}
        </AppText>
        <AppText className="mt-1 text-[13px] leading-5 text-muted">
          The photo saves either way. Friends is the usual share.
        </AppText>
        <Choice label="Friends" onPress={() => onSave('friends')} primary />
        <Choice label="Public" onPress={() => onSave('public')} />
      </View>
    </ChromeOverlay>
  );
}

function Choice({
  label,
  onPress,
  primary,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      className="mt-3 items-center justify-center rounded-full"
      style={{
        minHeight: 44,
        backgroundColor: primary ? THEME.primary : THEME.background,
        borderWidth: 1,
        borderColor: primary ? THEME.primary : THEME.border,
      }}>
      <AppText
        className="text-[15px] font-semibold"
        style={{ color: primary ? THEME.primaryForeground : THEME.textPrimary }}>
        {label}
      </AppText>
    </Pressable>
  );
}
