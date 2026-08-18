import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { InAppCamera } from '@/components/capture/InAppCamera';
import { Button } from '@/components/ui/Button';
import { AppText } from '@/components/ui/AppText';
import { isVideoProof, proofMeta } from '@/lib/constants';
import {
  cameraIsAvailable,
  ensureCapturePermissions,
  ensureLibraryPermission,
  openAppSettings,
} from '@/lib/mediaPermissions';
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
  const isVideo = isVideoProof(type);
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [webFallback, setWebFallback] = useState(false);
  const [busy, setBusy] = useState(false);

  async function startCamera() {
    if (locked || busy) {
      return;
    }
    setBusy(true);
    try {
      const permission = await ensureCapturePermissions(isVideo ? 'video' : 'photo');
      if (!permission.ok) {
        setBlocked(true);
      } else {
        setBlocked(false);
        const available = await cameraIsAvailable();
        setWebFallback(!available);
      }
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }

  async function openLibrary() {
    const permission = await ensureLibraryPermission();
    if (!permission.ok) {
      Alert.alert('Photo library is off.', 'Turn it on in Settings.', [
        { text: 'Open Settings', onPress: () => void openAppSettings() },
      ]);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: isVideo ? ['videos'] : ['images'],
      allowsEditing: false,
      quality: 0.8,
      videoMaxDuration: isVideo ? 30 : undefined,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      onPicked(result.assets[0].uri, result.assets[0].mimeType);
      setOpen(false);
    }
  }

  const emptyHeight = compact ? 'h-[120px] items-center justify-center px-6' : 'h-[220px] items-center justify-center px-6';
  const previewHeight = compact ? 148 : 280;

  if (open && !locked) {
    return (
      <View style={{ height: Math.max(previewHeight, 320), borderRadius: THEME.radius, overflow: 'hidden' }}>
        <InAppCamera
          capture={isVideo ? 'video' : 'photo'}
          maxDuration={isVideo ? 30 : 15}
          blocked={blocked}
          webFallback={webFallback}
          onCaptured={(media) => {
            onPicked(media.uri, media.mimeType);
            setOpen(false);
          }}
          onOpenGallery={() => void openLibrary()}
          onCancel={() => setOpen(false)}
          onUnavailable={() => setWebFallback(true)}
        />
      </View>
    );
  }

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
        <Button
          title={uri ? (isVideo ? 'Re-record' : 'Retake') : isVideo ? 'Record' : 'Take photo'}
          size="md"
          loading={busy}
          onPress={() => void startCamera()}
        />
      )}
    </View>
  );
}
