import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { AppText } from '@/components/ui/AppText';
import { isVideoProof, proofMeta } from '@/lib/constants';
import { THEME } from '@/lib/theme';
import type { ProofType } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';

type ProofUploaderProps = {
  type: ProofType;
  uri?: string | null;
  locked?: boolean;
  compact?: boolean;
  onPicked: (uri: string, mimeType?: string | null) => void;
  onClear?: () => void;
};

export function ProofUploader({
  type,
  uri,
  locked = false,
  compact = false,
  onPicked,
}: ProofUploaderProps) {
  const meta = proofMeta(type);
  const isSelfie = type === 'pre_selfie' || type === 'post_selfie';
  const isVideo = isVideoProof(type);
  const [busy, setBusy] = useState<'camera' | 'library' | null>(null);

  async function pick(source: 'camera' | 'library') {
    if (locked || busy) {
      return;
    }
    setBusy(source);
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(
            'Camera access needed',
            isVideo
              ? 'Turn on camera access in Settings to record this proof.'
              : 'Turn on camera access in Settings to take this proof.',
          );
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: isVideo ? ['videos'] : ['images'],
          allowsEditing: isSelfie,
          aspect: isSelfie ? [3, 4] : undefined,
          quality: 0.8,
          videoMaxDuration: isVideo ? 30 : undefined,
        });
        if (!result.canceled && result.assets[0]?.uri) {
          onPicked(result.assets[0].uri, result.assets[0].mimeType);
        }
        return;
      }

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Photo access needed',
          isVideo
            ? 'Turn on photo access in Settings to attach this video.'
            : 'Turn on photo access in Settings to attach this proof.',
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: isVideo ? ['videos'] : ['images'],
        allowsEditing: isSelfie,
        aspect: isSelfie ? [3, 4] : undefined,
        quality: 0.8,
        videoMaxDuration: isVideo ? 30 : undefined,
      });
      if (!result.canceled && result.assets[0]?.uri) {
        onPicked(result.assets[0].uri, result.assets[0].mimeType);
      }
    } catch (error) {
      Alert.alert('Couldn’t add that proof', getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  const emptyHeight = compact ? 'h-[120px] items-center justify-center px-6' : 'h-[220px] items-center justify-center px-6';
  const previewHeight = compact ? 148 : 280;

  return (
    <View className="gap-3">
      <View
        className="overflow-hidden"
        style={{
          borderRadius: THEME.radius,
          borderWidth: 1.5,
          borderStyle: uri ? 'solid' : 'dashed',
          borderColor: uri ? THEME.accent : THEME.border,
          backgroundColor: THEME.surface,
        }}>
        {uri && isVideo ? (
          <View className={emptyHeight} style={{ minHeight: previewHeight }}>
            <AppText className="text-center text-base font-semibold text-charcoal">
              Video attached
            </AppText>
            <AppText className="mt-2 text-center text-sm leading-6 text-muted">
              {meta.helper}
            </AppText>
          </View>
        ) : uri ? (
          <Image
            source={{ uri }}
            style={{ height: previewHeight, width: '100%' }}
            contentFit="contain"
          />
        ) : (
          <View className={emptyHeight}>
            <AppText className="text-center text-base font-semibold text-charcoal">
              {meta.label}
            </AppText>
            <AppText className="mt-2 text-center text-sm leading-6 text-muted">
              {meta.helper}
            </AppText>
          </View>
        )}
      </View>

      {locked ? null : (
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Button
              title={uri ? (isVideo ? 'Re-record' : 'Retake') : isVideo ? 'Record' : 'Take photo'}
              size="md"
              loading={busy === 'camera'}
              disabled={Boolean(busy)}
              onPress={() => void pick('camera')}
            />
          </View>
          <View className="flex-1">
            <Button
              title={uri ? 'Replace' : isVideo ? 'Choose video' : 'Choose photo'}
              variant="outline"
              size="md"
              loading={busy === 'library'}
              disabled={Boolean(busy)}
              onPress={() => void pick('library')}
            />
          </View>
        </View>
      )}
    </View>
  );
}
