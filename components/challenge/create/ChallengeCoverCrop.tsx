import { Modal, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { LOBBY_COVER_ASPECT } from '@/lib/lobbyCover';
import { THEME } from '@/lib/theme';

type ChallengeCoverCropProps = {
  uri: string | null;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ChallengeCoverCrop({ uri, busy, onCancel, onConfirm }: ChallengeCoverCropProps) {
  const insets = useSafeAreaInsets();
  if (!uri) {
    return null;
  }
  return (
    <Modal visible animationType="fade" transparent onRequestClose={onCancel}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(16,19,18,0.72)',
          paddingTop: insets.top + 16,
          paddingBottom: insets.bottom + 16,
          paddingHorizontal: 20,
          justifyContent: 'center',
        }}>
        <AppText className="text-center text-[15px] font-bold" style={{ color: '#FFFFFF' }}>
          Crop to the lobby card
        </AppText>
        <AppText className="mt-1 text-center text-[13px] leading-5" style={{ color: 'rgba(247,247,245,0.78)' }}>
          This is the frame on the challenge card. Confirm to save it.
        </AppText>
        <View
          style={{
            alignSelf: 'center',
            width: '78%',
            maxWidth: 280,
            aspectRatio: LOBBY_COVER_ASPECT,
            marginTop: 20,
            borderRadius: 16,
            overflow: 'hidden',
            backgroundColor: THEME.surface,
          }}>
          <Image source={{ uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        </View>
        <View className="mt-6 flex-row justify-center" style={{ gap: 12 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cancel crop"
            disabled={busy}
            onPress={onCancel}
            style={{ minHeight: 44, minWidth: 96, justifyContent: 'center', alignItems: 'center' }}>
            <AppText className="text-[15px] font-semibold" style={{ color: '#FFFFFF' }}>
              Cancel
            </AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Use cropped photo"
            disabled={busy}
            onPress={onConfirm}
            style={{
              minHeight: 44,
              paddingHorizontal: 18,
              borderRadius: 999,
              backgroundColor: THEME.primary,
              justifyContent: 'center',
              alignItems: 'center',
              opacity: busy ? 0.45 : 1,
            }}>
            <AppText className="text-[15px] font-semibold" style={{ color: THEME.primaryForeground }}>
              {busy ? 'Saving…' : 'Use photo'}
            </AppText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
